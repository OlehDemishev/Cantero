import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateEstimateAlternateInput, DecideEstimateAlternateInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { calculateAlternatesTotal } from "./estimate-alternates-total";

@Injectable()
export class EstimateAlternatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForEstimate(companyId: string, estimateId: string) {
    const estimate = await this.prisma.estimate.findFirst({ where: { id: estimateId, companyId } });
    if (!estimate) throw new NotFoundException("Estimate not found");

    const alternates = await this.prisma.estimateAlternate.findMany({ where: { estimateId }, orderBy: { createdAt: "asc" } });
    return { alternates, ...calculateAlternatesTotal(alternates.map((a) => ({ status: a.status, amount: Number(a.amount) }))) };
  }

  async create(companyId: string, actor: AuditActor, estimateId: string, input: CreateEstimateAlternateInput) {
    const estimate = await this.prisma.estimate.findFirst({ where: { id: estimateId, companyId } });
    if (!estimate) throw new NotFoundException("Estimate not found");

    const alternate = await this.prisma.estimateAlternate.create({
      data: { companyId, estimateId, title: input.title, description: input.description, amount: input.amount },
    });
    this.audit.record(companyId, actor, "estimate_alternate.created", "EstimateAlternate", alternate.id, `Added alternate "${input.title}" to "${estimate.name}"`);
    return alternate;
  }

  async decide(companyId: string, actor: AuditActor, id: string, input: DecideEstimateAlternateInput) {
    const alternate = await this.prisma.estimateAlternate.findFirst({ where: { id, companyId } });
    if (!alternate) throw new NotFoundException("Alternate not found");
    if (alternate.status !== "pending") throw new BadRequestException("Only a pending alternate can be decided");

    const updated = await this.prisma.estimateAlternate.update({
      where: { id },
      data: { status: input.status, decidedAt: new Date() },
    });
    this.audit.record(companyId, actor, `estimate_alternate.${input.status}`, "EstimateAlternate", id, `${input.status === "accepted" ? "Accepted" : "Rejected"} alternate "${alternate.title}"`);
    return updated;
  }
}
