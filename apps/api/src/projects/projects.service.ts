import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateProjectInput,
  ImportResult,
  UpdateProjectCurrencyInput,
  UpdateProjectBudgetAlertThresholdInput,
  UpdateProjectContingencyInput,
  UpdateProjectGeofenceInput,
  UpdateProjectPublicWorkInput,
  UpdateProjectWarrantyInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { ProjectAccessService } from "../common/project-access/project-access.service";
import { WeatherService } from "../weather/weather.service";
import { parseCsvRecords } from "../common/csv";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { MessageTemplatesService } from "../message-templates/message-templates.service";

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly weather: WeatherService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly messageTemplates: MessageTemplatesService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  /** Owner/admin always see every project. Everyone else sees a restricted project only if
   * they're on its ProjectMember list — restrictedToMembers defaults to false, so this is a
   * pure opt-in narrowing, not a change in behavior for projects nobody has restricted. */
  async list(companyId: string, userId?: string, role?: string) {
    const projects = await this.prisma.project.findMany({
      where: { companyId },
      include: { client: true },
      orderBy: { createdAt: "desc" },
    });
    // No userId/role means an internal/service-to-service caller (e.g. the public API, which is
    // already all-or-nothing per company) rather than a user-driven request — skip the narrowing.
    return this.projectAccess.filterAccessible(projects, userId, role);
  }

  async get(companyId: string, id: string, userId?: string, role?: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, companyId },
      include: { client: true },
    });
    if (!project) throw new NotFoundException("Project not found");
    await this.projectAccess.assertAccess(companyId, id, userId, role);
    return project;
  }

  listMembers(companyId: string, projectId: string) {
    return this.prisma.projectMember.findMany({
      where: { companyId, projectId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async addMember(companyId: string, actor: AuditActor, projectId: string, userId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    const membership = await this.prisma.membership.findFirst({ where: { companyId, userId } });
    if (!membership) throw new BadRequestException("User is not a member of this company");

    const member = await this.prisma.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      create: { companyId, projectId, userId },
      update: {},
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    this.audit.record(companyId, actor, "project.member_added", "Project", projectId, `Gave ${member.user.name} access to "${project.name}"`);
    return member;
  }

  async removeMember(companyId: string, actor: AuditActor, projectId: string, userId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    await this.prisma.projectMember.deleteMany({ where: { companyId, projectId, userId } });
    this.audit.record(companyId, actor, "project.member_removed", "Project", projectId, `Removed a member's access to "${project.name}"`);
    return { ok: true };
  }

  async setRestricted(companyId: string, actor: AuditActor, projectId: string, restrictedToMembers: boolean) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    const updated = await this.prisma.project.update({ where: { id: projectId }, data: { restrictedToMembers } });
    this.audit.record(
      companyId,
      actor,
      "project.restriction_changed",
      "Project",
      projectId,
      `${restrictedToMembers ? "Restricted" : "Opened"} access to "${project.name}"`,
    );
    return updated;
  }

  /** Best-effort 5-day-ahead forecast for the project's site, geocoded from its free-text address. `available: false` means no address is set or the location couldn't be resolved — not an error, just nothing to show. */
  async weatherForecast(companyId: string, id: string) {
    const project = await this.get(companyId, id);
    if (!project.address) return { available: false as const, days: [] };

    const coords = await this.weather.geocode(project.address);
    if (!coords) return { available: false as const, days: [] };

    const days = await this.weather.forecast(coords.lat, coords.lon, 0);
    return { available: true as const, days };
  }

  async create(companyId: string, input: CreateProjectInput) {
    if (input.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: input.clientId, companyId } });
      if (!client) throw new NotFoundException("Client not found");
    }
    return this.prisma.project.create({ data: { ...input, companyId } });
  }

  /** Best-effort lat/lng for the project's free-text address, to pre-fill the geofence-setup form. Returns null if there's no address or it can't be resolved. */
  async geocode(companyId: string, id: string) {
    const project = await this.get(companyId, id);
    if (!project.address) return null;
    return this.weather.geocode(project.address);
  }

  async updateGeofence(companyId: string, id: string, input: UpdateProjectGeofenceInput) {
    await this.get(companyId, id);
    return this.prisma.project.update({
      where: { id },
      data: { geofenceLat: input.lat, geofenceLng: input.lng, geofenceRadiusMeters: input.radiusMeters },
      include: { client: true },
    });
  }

  async clearGeofence(companyId: string, id: string) {
    await this.get(companyId, id);
    return this.prisma.project.update({
      where: { id },
      data: { geofenceLat: null, geofenceLng: null, geofenceRadiusMeters: null },
      include: { client: true },
    });
  }

  async updatePublicWork(companyId: string, id: string, input: UpdateProjectPublicWorkInput) {
    await this.get(companyId, id);
    return this.prisma.project.update({
      where: { id },
      data: { isPublicWork: input.isPublicWork, contractNumber: input.contractNumber },
      include: { client: true },
    });
  }

  async updateCurrency(companyId: string, id: string, input: UpdateProjectCurrencyInput) {
    await this.get(companyId, id);
    return this.prisma.project.update({
      where: { id },
      data: { currency: input.currency },
      include: { client: true },
    });
  }

  async updateBudgetAlertThreshold(companyId: string, id: string, input: UpdateProjectBudgetAlertThresholdInput) {
    await this.get(companyId, id);
    return this.prisma.project.update({
      where: { id },
      data: { budgetAlertThresholdPercent: input.budgetAlertThresholdPercent },
      include: { client: true },
    });
  }

  async updateContingency(companyId: string, id: string, input: UpdateProjectContingencyInput) {
    await this.get(companyId, id);
    return this.prisma.project.update({
      where: { id },
      data: { contingencyAmount: input.contingencyAmount },
      include: { client: true },
    });
  }

  async updateWarranty(companyId: string, id: string, input: UpdateProjectWarrantyInput) {
    await this.get(companyId, id);
    return this.prisma.project.update({
      where: { id },
      data: {
        handoverDate: input.handoverDate === null ? null : input.handoverDate ? new Date(input.handoverDate) : undefined,
        warrantyMonths: input.warrantyMonths,
      },
      include: { client: true },
    });
  }

  /**
   * CSV columns: name (required), address, client (optional — matched case-insensitively
   * against this company's existing client names). An unmatched client name doesn't fail the
   * row: the project is still created without a client link, since the name/address are still
   * useful data and a typo in one column shouldn't sink an otherwise-good bulk import.
   */
  async importCsv(companyId: string, actor: AuditActor, csv: string): Promise<ImportResult> {
    const records = parseCsvRecords(csv);
    const result: ImportResult = { created: 0, skipped: 0, errors: [] };

    const clients = await this.prisma.client.findMany({ where: { companyId }, select: { id: true, name: true } });
    const clientIdByName = new Map(clients.map((c) => [c.name.trim().toLowerCase(), c.id]));

    const toCreate: { name: string; address: string | null; clientId: string | null }[] = [];

    records.forEach((record, index) => {
      const row = index + 2; // header is row 1
      const name = record.name?.trim();
      if (!name) {
        result.skipped++;
        result.errors.push({ row, message: "Missing name" });
        return;
      }
      const clientName = record.client?.trim();
      const clientId = clientName ? (clientIdByName.get(clientName.toLowerCase()) ?? null) : null;
      toCreate.push({ name, address: record.address?.trim() || null, clientId });
    });

    if (toCreate.length > 0) {
      await this.prisma.project.createMany({ data: toCreate.map((p) => ({ ...p, companyId })) });
      result.created = toCreate.length;
    }

    this.audit.record(
      companyId,
      actor,
      "projects.imported",
      "Company",
      companyId,
      `Imported ${result.created} projects from CSV (${result.skipped} skipped)`,
    );

    return result;
  }

  /** Emails the client a link to leave a public review, once per project — the button that
   * triggers this is meant to live in the closeout flow, but nothing here requires the project
   * to actually be closed out; it just needs a client with an email on file. */
  async requestReview(companyId: string, actor: AuditActor, id: string) {
    const [project, company] = await Promise.all([
      this.prisma.project.findFirst({ where: { id, companyId }, include: { client: true } }),
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
    ]);
    if (!project) throw new NotFoundException("Project not found");
    if (!company.reviewRequestUrl) {
      throw new BadRequestException("Set a review link in Settings before requesting reviews");
    }
    if (!project.client?.email) {
      throw new BadRequestException("This project's client has no email on file");
    }

    const custom = await this.messageTemplates.render(companyId, "review_request_email", {
      clientName: project.client.name,
      companyName: company.name,
      projectName: project.name,
      reviewUrl: company.reviewRequestUrl,
    });

    await this.mail.send({
      to: project.client.email,
      subject: `How did we do on ${project.name}?`,
      text:
        custom ??
        `Hi ${project.client.name},\n\nThank you for choosing ${company.name} for ${project.name}. If you have a moment, we'd really appreciate a review: ${company.reviewRequestUrl}\n\nThank you!`,
      html: custom
        ? `<p>${custom.replace(/\n/g, "<br>")}</p>`
        : `<p>Hi ${project.client.name},</p><p>Thank you for choosing ${company.name} for <strong>${project.name}</strong>. If you have a moment, we'd really appreciate a review:</p><p><a href="${company.reviewRequestUrl}">${company.reviewRequestUrl}</a></p><p>Thank you!</p>`,
    });

    const updated = await this.prisma.project.update({
      where: { id },
      data: { reviewRequestedAt: new Date() },
      include: { client: true },
    });

    this.audit.record(companyId, actor, "project.review_requested", "Project", id, `Requested a review for "${project.name}"`);
    return updated;
  }

  /** Before/after documents for a project's marketing gallery — just the two categories, no
   * pairing logic, since a company may not upload matched before/after pairs 1:1. */
  async gallery(companyId: string, id: string) {
    await this.get(companyId, id);
    const [before, after] = await Promise.all([
      this.prisma.document.findMany({
        where: { companyId, projectId: id, category: "gallery_before" },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.document.findMany({
        where: { companyId, projectId: id, category: "gallery_after" },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return { before, after };
  }
}
