import { randomBytes } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import type { SubmitPublicLeadInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly webhooks: WebhooksService,
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

  async getFormInfo(token: string) {
    const company = await this.prisma.company.findUnique({ where: { publicLeadFormToken: token }, select: { name: true } });
    if (!company) throw new NotFoundException("This form link is no longer active");
    return { companyName: company.name };
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
