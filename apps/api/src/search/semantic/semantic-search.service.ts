import { createHash } from "node:crypto";
import { BadRequestException, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import type { Queue } from "bullmq";
import type { AuthUser } from "@cantero/shared";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ProjectAccessService } from "../../common/project-access/project-access.service";
import { SEMANTIC_INDEX_QUEUE } from "../../common/queue/queue.module";
import { Embedder } from "./embedder";
import { linkFor, SEMANTIC_TYPES, SOURCES, type SemanticType } from "./sources";

const INDEX_INTERVAL_MS = 5 * 60 * 1000;
const INDEX_BATCH = 64;
/** Per run and record type, so one huge backlog can't hold the worker for long. */
const INDEX_MAX_PER_RUN = 1024;
/** Vectors are held in memory per company for this long (search is a scan over them). */
const CACHE_TTL_MS = 60 * 1000;

export interface SemanticResult {
  type: SemanticType;
  id: string;
  projectId: string;
  title: string;
  subtitle: string;
  link: string;
  score: number;
}

interface CachedVector {
  type: SemanticType;
  id: string;
  projectId: string | null;
  vector: Float32Array;
}

/**
 * Search by meaning across RFIs, punch items, daily logs and tasks, in any of the app's languages
 * ("water in the basement" finds "Feuchtigkeit im Keller"), and "a similar item already exists"
 * hints when someone files a new RFI or punch item. Embeddings are computed locally (Embedder);
 * the vectors live in Postgres and a company's are scanned in memory — a few thousand records per
 * company take milliseconds, with no vector extension needed in the database.
 */
@Injectable()
export class SemanticSearchService implements OnModuleInit {
  private readonly logger = new Logger(SemanticSearchService.name);
  private readonly cache = new Map<string, { at: number; vectors: CachedVector[] }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedder: Embedder,
    private readonly projectAccess: ProjectAccessService,
    @InjectQueue(SEMANTIC_INDEX_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    if (!this.embedder.enabled) return;
    await this.queue.add("index", {}, { repeat: { every: INDEX_INTERVAL_MS }, jobId: "semantic-index-repeat" });
  }

  /**
   * Embeds every record whose text changed since it was last embedded, and drops rows for deleted
   * records. The hash covers the model name too, so switching EMBEDDINGS_MODEL re-embeds everything
   * rather than comparing vectors from two different models.
   */
  async indexPending(): Promise<{ indexed: number; removed: number }> {
    const model = this.embedder.model;
    let indexed = 0;
    let removed = 0;
    for (const type of SEMANTIC_TYPES) {
      const source = SOURCES[type];
      for (let done = 0; done < INDEX_MAX_PER_RUN; ) {
        const rows = await this.prisma.$queryRawUnsafe<{ id: string; companyId: string; projectId: string | null; text: string }[]>(
          `SELECT r.id, r."companyId", r."projectId", ${source.text} AS text
             FROM "${source.table}" r
             LEFT JOIN search_embeddings e ON e."entityType" = $1 AND e."entityId" = r.id
            WHERE e."contentHash" IS DISTINCT FROM md5($3 || E'\\n' || ${source.text})
            LIMIT $2`,
          type,
          INDEX_BATCH,
          model,
        );
        if (rows.length === 0) break;
        // Empty text is stored with an empty vector: its hash still matches, so it isn't picked up again.
        const withText = rows.filter((r) => r.text.trim());
        const vectors = await this.embedder.embedPassages(withText.map((r) => r.text));
        const byId = new Map(withText.map((r, i) => [r.id, vectors[i]]));
        await this.prisma.$transaction(
          rows.map((r) => {
            const data = { companyId: r.companyId, projectId: r.projectId, contentHash: md5(`${model}\n${r.text}`), embedding: byId.get(r.id) ?? [] };
            return this.prisma.searchEmbedding.upsert({
              where: { entityType_entityId: { entityType: type, entityId: r.id } },
              create: { entityType: type, entityId: r.id, ...data },
              update: data,
            });
          }),
        );
        for (const companyId of new Set(rows.map((r) => r.companyId))) this.cache.delete(companyId);
        indexed += rows.length;
        done += rows.length;
        if (rows.length < INDEX_BATCH) break;
      }
      removed += await this.prisma.$executeRawUnsafe(
        `DELETE FROM search_embeddings e WHERE e."entityType" = $1 AND NOT EXISTS (SELECT 1 FROM "${source.table}" r WHERE r.id = e."entityId")`,
        type,
      );
    }
    if (indexed > 0 || removed > 0) this.logger.log(`Semantic index: ${indexed} embedded, ${removed} removed`);
    return { indexed, removed };
  }

  /** Records whose meaning matches `query`, best first, only from projects the user may see. */
  async search(user: AuthUser, query: string, options: { projectId?: string; limit?: number } = {}): Promise<SemanticResult[]> {
    this.assertEnabled();
    const q = query.trim();
    if (q.length < 3) return [];
    const vector = await this.embedder.embedQuery(q);
    const hits = this.rank(await this.vectorsFor(user.companyId), vector, {
      minScore: this.embedder.profile.minSearchScore,
      limit: Math.min(options.limit ?? 10, 50),
      projectId: options.projectId,
    });
    return this.hydrate(user, hits);
  }

  /**
   * Existing records of `type` in the same project that say the same thing as `text` — shown as
   * "possible duplicate" while someone files a new RFI or punch item.
   */
  async similar(user: AuthUser, input: { type: SemanticType; projectId: string; text: string; excludeId?: string }): Promise<SemanticResult[]> {
    this.assertEnabled();
    if (!SEMANTIC_TYPES.includes(input.type)) throw new BadRequestException("Unknown record type");
    const text = input.text.trim();
    if (text.length < 8) return [];
    // A stored record is a passage; comparing passage to passage is what "the same thing" means.
    const [vector] = await this.embedder.embedPassages([text]);
    const hits = this.rank(await this.vectorsFor(user.companyId), vector, {
      minScore: this.embedder.profile.duplicateScore,
      limit: 3,
      projectId: input.projectId,
      type: input.type,
      excludeId: input.excludeId,
    });
    return this.hydrate(user, hits);
  }

  private assertEnabled() {
    if (!this.embedder.enabled) throw new BadRequestException("Meaning-based search is turned off on this server");
  }

  private rank(
    vectors: CachedVector[],
    query: number[],
    options: { minScore: number; limit: number; projectId?: string; type?: SemanticType; excludeId?: string },
  ): (CachedVector & { score: number })[] {
    const q = Float32Array.from(query);
    const scored: (CachedVector & { score: number })[] = [];
    for (const v of vectors) {
      if (options.projectId && v.projectId !== options.projectId) continue;
      if (options.type && v.type !== options.type) continue;
      if (options.excludeId && v.id === options.excludeId) continue;
      if (v.vector.length !== q.length) continue;
      let dot = 0;
      for (let i = 0; i < q.length; i++) dot += q[i] * v.vector[i];
      if (dot >= options.minScore) scored.push({ ...v, score: dot });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, options.limit);
  }

  private async vectorsFor(companyId: string): Promise<CachedVector[]> {
    const cached = this.cache.get(companyId);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.vectors;
    const rows = await this.prisma.searchEmbedding.findMany({
      where: { companyId },
      select: { entityType: true, entityId: true, projectId: true, embedding: true },
    });
    const vectors = rows
      .filter((r) => r.embedding.length > 0)
      .map((r) => ({ type: r.entityType as SemanticType, id: r.entityId, projectId: r.projectId, vector: Float32Array.from(r.embedding) }));
    this.cache.set(companyId, { at: Date.now(), vectors });
    return vectors;
  }

  /** Titles and links for the hits, dropping any in a restricted project the user isn't on and any
   * record deleted since it was indexed. */
  private async hydrate(user: AuthUser, hits: (CachedVector & { score: number })[]): Promise<SemanticResult[]> {
    if (hits.length === 0) return [];
    const projectIds = [...new Set(hits.map((h) => h.projectId).filter((p): p is string => !!p))];
    const projects = await this.prisma.project.findMany({
      where: { companyId: user.companyId, id: { in: projectIds } },
      select: { id: true, name: true, restrictedToMembers: true },
    });
    const visible = new Map((await this.projectAccess.filterAccessible(projects, user.userId, user.role)).map((p) => [p.id, p]));
    const ids = (type: SemanticType) => hits.filter((h) => h.type === type).map((h) => h.id);
    const where = (type: SemanticType) => ({ companyId: user.companyId, id: { in: ids(type) } });

    const [rfis, punch, logs, tasks] = await Promise.all([
      this.prisma.rfi.findMany({ where: where("rfi"), select: { id: true, number: true, subject: true, status: true } }),
      this.prisma.punchListItem.findMany({ where: where("punch_list_item"), select: { id: true, title: true, location: true, status: true } }),
      this.prisma.dailyLog.findMany({ where: where("daily_log"), select: { id: true, date: true, workPerformed: true } }),
      this.prisma.task.findMany({ where: where("task"), select: { id: true, name: true, status: true } }),
    ]);
    const details = new Map<string, { title: string; detail: string }>([
      ...rfis.map((r) => [r.id, { title: `${r.number} ${r.subject}`, detail: r.status }] as const),
      ...punch.map((p) => [p.id, { title: p.title, detail: [p.location, p.status].filter(Boolean).join(" · ") }] as const),
      ...logs.map((l) => [l.id, { title: l.workPerformed.slice(0, 120), detail: l.date.toISOString().slice(0, 10) }] as const),
      ...tasks.map((t) => [t.id, { title: t.name, detail: t.status }] as const),
    ]);

    const results: SemanticResult[] = [];
    for (const hit of hits) {
      const project = hit.projectId ? visible.get(hit.projectId) : undefined;
      const d = details.get(hit.id);
      if (!project || !d) continue;
      results.push({
        type: hit.type,
        id: hit.id,
        projectId: project.id,
        title: d.title,
        subtitle: [project.name, d.detail].filter(Boolean).join(" · "),
        link: linkFor(hit.type, project.id, hit.id),
        score: Math.round(hit.score * 1000) / 1000,
      });
    }
    return results;
  }
}

function md5(text: string): string {
  return createHash("md5").update(text, "utf8").digest("hex");
}
