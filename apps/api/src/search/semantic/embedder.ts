import { join } from "node:path";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * BAAI bge-m3 (MIT licence, 100+ languages, 1024 dimensions, ~560 MB int8). Chosen over the smaller
 * multilingual-e5 models on a calibration set of construction records in German, English, Polish and
 * Ukrainian: it ranked the right record first for 7 of 7 cross-language queries (e5-small 5/7,
 * e5-base 6/7). Its absolute scores do not cleanly separate relevant from unrelated text on real
 * records (short generic names like "Демонтажні роботи" score high against many queries), hence the
 * window below. A cross-encoder reranker (bge-reranker-v2-m3) was tried on the same set and didn't
 * earn its cost: about as often right first (38 vs 37 of 51 queries), ~0.9 s per query, 560 MB more.
 * The cost is memory: about 1.7 GB resident once loaded.
 */
export const DEFAULT_EMBEDDING_MODEL = "Xenova/bge-m3";

export interface ModelProfile {
  /** Below this, a search hit is unrelated text. */
  minSearchScore: number;
  /** Search shows only hits within this much of the best one: scores from a cross-language query
   * run lower across the board, so a fixed floor alone either drops them or lets noise through. */
  searchWindow: number;
  /** At or above this, a new record is flagged as possibly the same as an existing one. */
  duplicateScore: number;
}

/**
 * Score thresholds measured per model. bge-m3 was calibrated on 2026-09-22 against a real company's
 * records (Ukrainian RFIs, punch items, daily logs, tasks) with 89 queries in English, German,
 * Spanish, Polish and Ukrainian, 15 of them with no matching record, and 20 new RFIs/punch items (10
 * true duplicates, 10 look-alikes about another room, material or defect). Search scores a record by
 * its better vector, title or full text; floor 0.63 with a 0.05 window showed 5 unrelated records
 * in 76 results (the fixed 0.63 floor alone: 35 in 105) and put a right one first for 43 of 74
 * queries (37). Duplicates compare full texts only — a title vector made look-alikes score higher
 * ("damaged paint in the lobby" vs "damaged tile in the lobby": 0.84). At 0.69 it caught 4 of 10
 * duplicates (0.70–0.89) with no false alarm; look-alikes reach 0.67, the same pair varies by about
 * 0.01 between runs (int8 model, different batches), and cross-language duplicates can score as low
 * as 0.46 — so it is a hint that catches the obvious ones, not a duplicate detector. The e5
 * profiles come from an earlier, smaller hand-made set and have no window measured.
 */
const PROFILES: Record<string, ModelProfile> = {
  "Xenova/bge-m3": { minSearchScore: 0.63, searchWindow: 0.05, duplicateScore: 0.69 },
  "Xenova/multilingual-e5-base": { minSearchScore: 0.8, searchWindow: 1, duplicateScore: 0.96 },
  "Xenova/multilingual-e5-small": { minSearchScore: 0.8, searchWindow: 1, duplicateScore: 0.975 },
};
/** An uncalibrated model: only show strong matches. */
const FALLBACK_PROFILE: ModelProfile = { minSearchScore: 0.8, searchWindow: 1, duplicateScore: 0.97 };
/** e5 models are trained with these prefixes (leaving them off noticeably hurts ranking); other
 * models, e.g. bge-m3, take the text as is. */
const prefixesFor = (model: string) => (/e5/i.test(model) ? { query: "query: ", passage: "passage: " } : { query: "", passage: "" });
/** How token vectors become one text vector: bge models are trained on the [CLS] token, e5 and
 * most sentence-transformers on the mean. */
const poolingFor = (model: string): "cls" | "mean" => (/bge/i.test(model) ? "cls" : "mean");
/** Past this the model truncates anyway (512 tokens); cutting early saves tokenizer work. */
const MAX_CHARS = 2000;

type Extractor = (texts: string[], options: { pooling: "mean" | "cls"; normalize: true }) => Promise<{ tolist(): number[][] }>;

/**
 * Text → vector, computed on this server's CPU with transformers.js (ONNX Runtime). Nothing is sent
 * anywhere: the model's weights are fetched once from the Hugging Face hub into
 * EMBEDDINGS_CACHE_DIR (or pre-placed there, with EMBEDDINGS_ALLOW_DOWNLOAD=false, for a server
 * with no outbound access) and every embedding is computed locally from then on.
 */
@Injectable()
export class Embedder {
  private readonly logger = new Logger(Embedder.name);
  private extractor: Promise<Extractor> | null = null;

  constructor(private readonly config: ConfigService) {}

  get model(): string {
    return this.config.get<string>("EMBEDDINGS_MODEL") || DEFAULT_EMBEDDING_MODEL;
  }

  get profile(): ModelProfile {
    return PROFILES[this.model] ?? FALLBACK_PROFILE;
  }

  get enabled(): boolean {
    return this.config.get<string>("SEMANTIC_SEARCH_ENABLED") !== "false";
  }

  /** Unit vectors for stored records. */
  embedPassages(texts: string[]): Promise<number[][]> {
    const { passage } = prefixesFor(this.model);
    return this.embed(texts.map((t) => passage + t.slice(0, MAX_CHARS)));
  }

  /** Unit vector for what someone typed into search. */
  async embedQuery(text: string): Promise<number[]> {
    const [v] = await this.embed([prefixesFor(this.model).query + text.slice(0, MAX_CHARS)]);
    return v;
  }

  private async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await this.load();
    const out = await extractor(texts, { pooling: poolingFor(this.model), normalize: true });
    return out.tolist();
  }

  private load(): Promise<Extractor> {
    this.extractor ??= (async () => {
      // ESM-only package; see drawings/pdf-text.ts for why this is a dynamic import.
      const transformers = await import("@huggingface/transformers");
      // Not transformers.js's default (inside node_modules, wiped by every reinstall).
      transformers.env.cacheDir = this.config.get<string>("EMBEDDINGS_CACHE_DIR") || join(process.cwd(), ".models");
      transformers.env.allowRemoteModels = this.config.get<string>("EMBEDDINGS_ALLOW_DOWNLOAD") !== "false";
      const model = this.model;
      const started = Date.now();
      const pipe = await transformers.pipeline("feature-extraction", model, { dtype: "q8" });
      this.logger.log(`Loaded embedding model ${model} in ${Date.now() - started} ms`);
      return pipe as unknown as Extractor;
    })().catch((err: unknown) => {
      this.extractor = null; // let a later call retry (e.g. after the network comes back)
      throw err;
    });
    return this.extractor;
  }
}
