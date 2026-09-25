import { randomBytes } from "node:crypto";
import { promises as dns } from "node:dns";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { LinkToParentCompanyInput, SetCustomPortalDomainInput, UpdateCompanyInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { ExchangeRateService } from "../common/exchange-rate/exchange-rate.service";
import { assertPublicWebhookUrl } from "../common/webhooks/webhook-url";
import { html } from "../common/mail/html";

const MAX_LOGO_SIZE_BYTES = 1 * 1024 * 1024; // 1MB — a logo, not a photo
// pdfkit only rasterizes JPEG/PNG, so SVG (however common for logos) isn't accepted here.
const ALLOWED_LOGO_MIME_TYPES = new Set(["image/png", "image/jpeg"]);

/** The CNAME target a company's custom portal domain must point to before verifyCustomPortalDomain()
 * will mark it verified. This is the DNS-level check only — actually routing browser traffic for
 * the domain to this app (plus a TLS certificate for it) is infrastructure/ops work, not something
 * this check can provision. */
const CUSTOM_PORTAL_DOMAIN_CNAME_TARGET = "portal.cantero.dev";

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly exchangeRates: ExchangeRateService,
  ) {}

  async get(companyId: string) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    // Backfill for a company that existed before the referral program (or was seeded directly,
    // bypassing AuthService.signup()) rather than requiring a one-off migration script.
    if (!company.referralCode) {
      return this.prisma.company.update({ where: { id: companyId }, data: { referralCode: randomBytes(4).toString("hex") } });
    }
    return company;
  }

  /** How many companies signed up using this one's referral link. */
  async referralStats(companyId: string) {
    const referredCount = await this.prisma.company.count({ where: { referredByCompanyId: companyId } });
    return { referredCount };
  }

  async update(companyId: string, actor: AuditActor, input: UpdateCompanyInput) {
    // These two get fetched server-side on every webhook event (see WebhooksService.notifyChat)
    // — unlike the generic WebhookEndpoint feature, they weren't validated at all, letting a
    // company point them at an internal/cloud-metadata address (SSRF). Same check, same place in
    // the lifecycle (write time, not on every delivery) as the generic webhooks feature already uses.
    if (input.slackWebhookUrl) await assertPublicWebhookUrl(input.slackWebhookUrl);
    if (input.teamsWebhookUrl) await assertPublicWebhookUrl(input.teamsWebhookUrl);

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
      html: html`<p>We've received your request to delete the <strong>${updated.name}</strong> account, submitted by ${actor.name}.</p><p>Our support team will follow up to confirm retention/legal requirements before proceeding. You can cancel this request any time from Settings.</p>`,
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
    const parent = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const children = await this.prisma.company.findMany({ where: { parentCompanyId: companyId }, orderBy: { name: "asc" } });
    if (children.length === 0) return { branches: [], reportingCurrency: parent.reportingCurrency ?? parent.currency };

    const reportingCurrency = parent.reportingCurrency ?? parent.currency;

    const branches = await Promise.all(
      children.map(async (child) => {
        const [revenue, projectCount, memberCount, costs] = await Promise.all([
          this.prisma.invoice.aggregate({ where: { companyId: child.id, status: "paid" }, _sum: { total: true } }),
          this.prisma.project.count({ where: { companyId: child.id } }),
          this.prisma.membership.count({ where: { companyId: child.id } }),
          this.branchActualCosts(child.id),
        ]);
        const rawRevenue = Number(revenue._sum.total ?? 0);
        const revenueConverted = await this.exchangeRates.convert(rawRevenue, child.currency, reportingCurrency);
        const costsConverted = await this.exchangeRates.convert(costs.total, child.currency, reportingCurrency);
        return {
          companyId: child.id,
          name: child.name,
          currency: child.currency,
          revenue: rawRevenue,
          revenueConverted,
          materialsCost: costs.materialsCost,
          laborCost: costs.laborCost,
          subcontractorCost: costs.subcontractorCost,
          costConverted: costsConverted,
          marginConverted: revenueConverted - costsConverted,
          projectCount,
          memberCount,
        };
      }),
    );

    return {
      branches,
      reportingCurrency,
      totals: {
        revenue: branches.reduce((sum, b) => sum + b.revenueConverted, 0),
        cost: branches.reduce((sum, b) => sum + b.costConverted, 0),
        margin: branches.reduce((sum, b) => sum + b.marginConverted, 0),
        projectCount: branches.reduce((sum, b) => sum + b.projectCount, 0),
        memberCount: branches.reduce((sum, b) => sum + b.memberCount, 0),
      },
    };
  }

  /** Company-wide actual cost — same materials/labor/subcontractor-cost valuation as
   * BudgetService.getForProject(), just summed across all of the branch's projects instead of one. */
  private async branchActualCosts(companyId: string) {
    const [consumptionMovements, timeEntries, subcontractorCosts] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where: { companyId, type: { in: ["issue", "write_off"] } },
        include: { materialCatalogItem: true },
      }),
      this.prisma.timeEntry.findMany({ where: { companyId }, include: { worker: true } }),
      this.prisma.subcontractorCost.findMany({ where: { companyId } }),
    ]);

    // Same "snapshot, don't let a later price change rewrite history" reasoning as
    // hourlyCostSnapshot below: unitCost is what the costing engine actually charged this
    // movement at the time — see StockMovement.unitCost's schema comment. Falling back to
    // today's catalog price only for a movement that never got cost data at all.
    const materialsCost = consumptionMovements.reduce(
      (sum, m) => sum + Number(m.quantity) * (m.unitCost != null ? Number(m.unitCost) : Number(m.materialCatalogItem.defaultUnitPrice)),
      0,
    );
    const laborCost = timeEntries.reduce((sum, entry) => {
      const rate = entry.hourlyCostSnapshot !== null ? Number(entry.hourlyCostSnapshot) : entry.worker.hourlyCost !== null ? Number(entry.worker.hourlyCost) : null;
      return rate !== null ? sum + Number(entry.hours) * rate : sum;
    }, 0);
    const subcontractorCost = subcontractorCosts.reduce((sum, c) => sum + Number(c.amount), 0);

    return { materialsCost, laborCost, subcontractorCost, total: materialsCost + laborCost + subcontractorCost };
  }

  /** Registers (or clears) the desired vanity domain — always unverified until verifyCustomPortalDomain()
   * confirms the CNAME. Setting a new value here doesn't touch a prior verified timestamp's meaning:
   * changing the domain string always resets verification, since the old timestamp verified a
   * different string. */
  async setCustomPortalDomain(companyId: string, actor: AuditActor, input: SetCustomPortalDomainInput) {
    try {
      const updated = await this.prisma.company.update({
        where: { id: companyId },
        data: { customPortalDomain: input.domain, customPortalDomainVerifiedAt: null },
      });
      this.audit.record(
        companyId,
        actor,
        "company.portal_domain_set",
        "Company",
        companyId,
        input.domain ? `Set custom portal domain to "${input.domain}"` : "Cleared custom portal domain",
      );
      return { customPortalDomain: updated.customPortalDomain, customPortalDomainVerifiedAt: updated.customPortalDomainVerifiedAt };
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        throw new BadRequestException(`Domain "${input.domain}" is already registered to another company`);
      }
      throw err;
    }
  }

  /** Live DNS check — resolves the registered domain's CNAME and confirms it points at our
   * target. Never throws on a DNS lookup failure (no record, NXDOMAIN, timeout); it just reports
   * not-yet-verified, since "the customer hasn't finished their DNS setup yet" is the expected
   * steady state right after setCustomPortalDomain(), not an error condition. */
  async verifyCustomPortalDomain(companyId: string, actor: AuditActor) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    if (!company.customPortalDomain) {
      throw new BadRequestException("Set a custom portal domain before verifying it");
    }

    let verified = false;
    try {
      const records = await dns.resolveCname(company.customPortalDomain);
      verified = records.some((r) => r.toLowerCase() === CUSTOM_PORTAL_DOMAIN_CNAME_TARGET.toLowerCase());
    } catch {
      verified = false;
    }

    if (!verified) {
      return { verified: false, cnameTarget: CUSTOM_PORTAL_DOMAIN_CNAME_TARGET, customPortalDomainVerifiedAt: null };
    }

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: { customPortalDomainVerifiedAt: new Date() },
    });
    this.audit.record(
      companyId,
      actor,
      "company.portal_domain_verified",
      "Company",
      companyId,
      `Verified custom portal domain "${company.customPortalDomain}"`,
    );
    return { verified: true, cnameTarget: CUSTOM_PORTAL_DOMAIN_CNAME_TARGET, customPortalDomainVerifiedAt: updated.customPortalDomainVerifiedAt };
  }

  /** Public, unauthenticated lookup for the portal's branded login page — returns null for any
   * domain that isn't registered and verified, so the frontend falls back to generic branding. */
  async getPortalBrandingForDomain(domain: string) {
    const company = await this.prisma.company.findFirst({
      where: { customPortalDomain: domain, customPortalDomainVerifiedAt: { not: null } },
      select: { name: true, brandColor: true, logoStorageKey: true },
    });
    if (!company) return null;
    return { name: company.name, brandColor: company.brandColor, hasLogo: !!company.logoStorageKey };
  }

  async getPortalLogoForDomain(domain: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const company = await this.prisma.company.findFirst({
      where: { customPortalDomain: domain, customPortalDomainVerifiedAt: { not: null } },
      select: { logoStorageKey: true, logoMimeType: true },
    });
    if (!company?.logoStorageKey || !company.logoMimeType) throw new NotFoundException("No logo uploaded");
    const buffer = await this.storage.read(company.logoStorageKey);
    return { buffer, mimeType: company.logoMimeType };
  }
}
