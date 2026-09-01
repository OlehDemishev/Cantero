import { randomBytes } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { SubmitPublicLeadInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { StorageService } from "../common/storage/storage.service";

const SHOWCASE_PHOTO_LIMIT = 12;

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
    private readonly storage: StorageService,
  ) {}

  async regenerateFormToken(companyId: string, actor: AuditActor) {
    const token = randomBytes(16).toString("hex");
    await this.prisma.company.update({ where: { id: companyId }, data: { publicLeadFormToken: token } });
    this.audit.record(companyId, actor, "lead_form.token_regenerated", "Company", companyId, "Regenerated the public lead-capture form link");
    return { token };
  }

  async disableFormToken(companyId: string, actor: AuditActor) {
    await this.prisma.company.update({ where: { id: companyId }, data: { publicLeadFormToken: null } });
    this.audit.record(companyId, actor, "lead_form.disabled", "Company", companyId, "Disabled the public lead-capture form");
    return { ok: true };
  }

  /** Company branding + a curated grid of finished-project photos, so the same link that
   * captures a lead also works as a shareable "here's our work" showcase page. */
  async getFormInfo(token: string) {
    const company = await this.prisma.company.findUnique({
      where: { publicLeadFormToken: token },
      select: { id: true, name: true, brandColor: true, logoStorageKey: true },
    });
    if (!company) throw new NotFoundException("This form link is no longer active");

    const photos = await this.prisma.document.findMany({
      where: { companyId: company.id, category: "gallery_after" },
      orderBy: { createdAt: "desc" },
      take: SHOWCASE_PHOTO_LIMIT,
      select: { id: true, project: { select: { name: true } } },
    });

    return {
      companyName: company.name,
      brandColor: company.brandColor,
      hasLogo: !!company.logoStorageKey,
      photos: photos.map((p) => ({ id: p.id, projectName: p.project?.name ?? null })),
    };
  }

  /** Streams one showcase photo's bytes — deliberately scoped to gallery_after documents
   * belonging to the token's own company, so this public route can never be used to fetch an
   * arbitrary document by guessing an id. */
  async getShowcasePhoto(token: string, documentId: string): Promise<{ buffer: Buffer; mimeType: string; name: string }> {
    const company = await this.prisma.company.findUnique({ where: { publicLeadFormToken: token }, select: { id: true } });
    if (!company) throw new NotFoundException("This form link is no longer active");

    const document = await this.prisma.document.findFirst({
      where: { id: documentId, companyId: company.id, category: "gallery_after" },
    });
    if (!document) throw new NotFoundException("Photo not found");

    const buffer = await this.storage.read(document.storageKey);
    return { buffer, mimeType: document.mimeType, name: document.name };
  }

  async getShowcaseLogo(token: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const company = await this.prisma.company.findUnique({
      where: { publicLeadFormToken: token },
      select: { logoStorageKey: true, logoMimeType: true },
    });
    if (!company?.logoStorageKey) throw new NotFoundException("No logo uploaded");
    const buffer = await this.storage.read(company.logoStorageKey);
    return { buffer, mimeType: company.logoMimeType ?? "image/png" };
  }

  /** Silently no-ops (returns success) when the honeypot is filled, so a bot never learns it was caught. */
  async submitLead(token: string, input: SubmitPublicLeadInput) {
    const company = await this.prisma.company.findUnique({ where: { publicLeadFormToken: token }, select: { id: true } });
    if (!company) throw new NotFoundException("This form link is no longer active");

    if (input.honeypot) return { ok: true };

    const client = await this.prisma.client.create({
      data: {
        companyId: company.id,
        name: input.name,
        email: input.email,
        phone: input.phone,
        notes: input.message,
      },
    });
    this.audit.record(
      company.id,
      { name: "Website lead form" },
      "lead.captured",
      "Client",
      client.id,
      `New lead from the website: "${input.name}"`,
    );
    this.webhooks.trigger(company.id, "client.lead_captured", { clientId: client.id, name: client.name });
    return { ok: true };
  }
}
