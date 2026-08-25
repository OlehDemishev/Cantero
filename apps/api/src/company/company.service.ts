import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { LinkToParentCompanyInput, UpdateCompanyInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";

const MAX_LOGO_SIZE_BYTES = 1 * 1024 * 1024; // 1MB — a logo, not a photo
// pdfkit only rasterizes JPEG/PNG, so SVG (however common for logos) isn't accepted here.
const ALLOWED_LOGO_MIME_TYPES = new Set(["image/png", "image/jpeg"]);

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  get(companyId: string) {
    return this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  }

  async update(companyId: string, actor: AuditActor, input: UpdateCompanyInput) {
    const updated = await this.prisma.company.update({ where: { id: companyId }, data: input });
    this.audit.record(companyId, actor, "company.settings_updated", "Company", companyId, "Updated company settings", input);
    return updated;
  }

  async completeOnboarding(companyId: string, actor: AuditActor) {
    const updated = await this.prisma.company.update({ where: { id: companyId }, data: { onboardingCompletedAt: new Date() } });
    this.audit.record(companyId, actor, "company.onboarding_completed", "Company", companyId, "Completed onboarding setup");
    return updated;
  }

  async uploadLogo(companyId: string, actor: AuditActor, file: Express.Multer.File) {
    if (file.size > MAX_LOGO_SIZE_BYTES) throw new BadRequestException("Logo exceeds the 1MB limit");
    if (!ALLOWED_LOGO_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`Logo must be PNG or JPEG (got "${file.mimetype}")`);
    }

    const stored = await this.storage.save(companyId, file.originalname, file.buffer);
    await this.prisma.company.update({
      where: { id: companyId },
      data: { logoStorageKey: stored.storageKey, logoMimeType: file.mimetype },
    });
    this.audit.record(companyId, actor, "company.logo_updated", "Company", companyId, "Updated company logo");
    return { ok: true };
  }

  async getLogo(companyId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    if (!company.logoStorageKey) throw new NotFoundException("No logo uploaded");
    const buffer = await this.storage.read(company.logoStorageKey);
    return { buffer, mimeType: company.logoMimeType ?? "image/png" };
  }

  /** GDPR Art. 17 — records the request; actual deletion goes through a manual support/legal review, not an automated hard delete. */
  async requestDeletion(companyId: string, actor: AuditActor, requesterEmail: string) {
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { deletionRequestedAt: new Date(), deletionRequestedByUserId: actor.userId },
    });
    this.audit.record(companyId, actor, "company.deletion_requested", "Company", companyId, "Requested account deletion");
    await this.mail.send({
      to: requesterEmail,
      subject: "Account deletion request received",
      text: `We've received your request to delete the ${updated.name} account, submitted by ${actor.name}. Our support team will follow up to confirm retention/legal requirements before proceeding. You can cancel this request any time from Settings.`,
      html: `<p>We've received your request to delete the <strong>${updated.name}</strong> account, submitted by ${actor.name}.</p><p>Our support team will follow up to confirm retention/legal requirements before proceeding. You can cancel this request any time from Settings.</p>`,
    });
    return updated;
  }

  async cancelDeletionRequest(companyId: string, actor: AuditActor) {
    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { deletionRequestedAt: null, deletionRequestedByUserId: null },
    });
    this.audit.record(companyId, actor, "company.deletion_request_cancelled", "Company", companyId, "Cancelled account deletion request");
    return updated;
  }

  /** Generates (or replaces) the token embedded in this company's public ICS calendar-subscription
   * URL. Regenerating invalidates any URL shared previously — useful if a link leaks. */
  async generateCalendarFeedToken(companyId: string, actor: AuditActor) {
    const token = randomBytes(16).toString("hex");
    const updated = await this.prisma.company.update({ where: { id: companyId }, data: { calendarFeedToken: token } });
    this.audit.record(companyId, actor, "company.calendar_feed_token_generated", "Company", companyId, "Generated a calendar feed token");
    return { calendarFeedToken: updated.calendarFeedToken };
  }

  /** Generates (or replaces) the one-time code a prospective branch redeems to link under this
   * company. Regenerating invalidates any code shared previously. */
  async generateFranchiseLinkCode(companyId: string, actor: AuditActor) {
    const code = randomBytes(6).toString("hex");
    const updated = await this.prisma.company.update({ where: { id: companyId }, data: { franchiseLinkCode: code } });
    this.audit.record(companyId, actor, "company.franchise_link_code_generated", "Company", companyId, "Generated a franchise link code");
    return { franchiseLinkCode: updated.franchiseLinkCode };
  }

  /** Links the caller's own company under a parent by redeeming its code — possession of the
   * code is the authorization, same trust model as an invite token. */
  async linkToParent(companyId: string, actor: AuditActor, input: LinkToParentCompanyInput) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    if (company.parentCompanyId) throw new BadRequestException("This company is already linked to a parent");

    const childCount = await this.prisma.company.count({ where: { parentCompanyId: companyId } });
    if (childCount > 0) throw new BadRequestException("A company with branches of its own can't also become a branch");

    const parent = await this.prisma.company.findUnique({ where: { franchiseLinkCode: input.code } });
    if (!parent) throw new BadRequestException("Invalid or expired link code");
    if (parent.id === companyId) throw new BadRequestException("A company can't link to itself");

    const updated = await this.prisma.company.update({ where: { id: companyId }, data: { parentCompanyId: parent.id } });
    this.audit.record(companyId, actor, "company.linked_to_parent", "Company", companyId, `Linked to parent company "${parent.name}"`);
    return updated;
  }

  /** Read-only rollup across every linked branch — revenue from paid invoices, open project
   * count, and headcount — computed live per child rather than cached, since a franchise owner
   * checking this dashboard wants current numbers, not yesterday's. */
  async franchiseOverview(companyId: string) {
    const children = await this.prisma.company.findMany({ where: { parentCompanyId: companyId }, orderBy: { name: "asc" } });
    if (children.length === 0) return { branches: [] };

    const branches = await Promise.all(
      children.map(async (child) => {
        const [revenue, projectCount, memberCount] = await Promise.all([
          this.prisma.invoice.aggregate({ where: { companyId: child.id, status: "paid" }, _sum: { total: true } }),
          this.prisma.project.count({ where: { companyId: child.id } }),
          this.prisma.membership.count({ where: { companyId: child.id } }),
        ]);
        return {
          companyId: child.id,
          name: child.name,
          revenue: Number(revenue._sum.total ?? 0),
          projectCount,
          memberCount,
        };
      }),
    );

    return {
      branches,
      totals: {
        revenue: branches.reduce((sum, b) => sum + b.revenue, 0),
        projectCount: branches.reduce((sum, b) => sum + b.projectCount, 0),
        memberCount: branches.reduce((sum, b) => sum + b.memberCount, 0),
      },
    };
  }
}
