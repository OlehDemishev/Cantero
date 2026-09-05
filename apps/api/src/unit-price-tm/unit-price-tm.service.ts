import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AddUnitPriceMeasurementInput,
  CreateTMTicketInput,
  CreateUnitPriceItemInput,
  DecideTMTicketInput,
  ReviseTMTicketInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { calculateUnitPriceBilling } from "./unit-price-calc";
import { calculateTMTicketTotal } from "./tm-ticket-calc";

@Injectable()
export class UnitPriceTmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Unit-price items

  listUnitPriceItems(companyId: string, projectId: string) {
    return this.prisma.unitPriceItem.findMany({
      where: { companyId, projectId },
      include: { measurements: { orderBy: { measuredAt: "desc" } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async createUnitPriceItem(companyId: string, actor: AuditActor, projectId: string, input: CreateUnitPriceItemInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const item = await this.prisma.unitPriceItem.create({
      data: {
        companyId,
        projectId,
        description: input.description,
        unit: input.unit,
        contractUnitPrice: input.contractUnitPrice,
        estimatedQuantity: input.estimatedQuantity,
      },
      include: { measurements: true },
    });

    this.audit.record(companyId, actor, "unit_price_item.created", "UnitPriceItem", item.id, `Added unit-price item "${input.description}"`);
    return item;
  }

  async addMeasurement(companyId: string, actor: AuditActor, unitPriceItemId: string, input: AddUnitPriceMeasurementInput) {
    const item = await this.prisma.unitPriceItem.findFirst({ where: { id: unitPriceItemId, companyId } });
    if (!item) throw new NotFoundException("Unit-price item not found");

    const measurement = await this.prisma.unitPriceMeasurement.create({
      data: {
        unitPriceItemId,
        measuredQuantity: input.measuredQuantity,
        measuredByName: input.measuredByName,
        notes: input.notes,
      },
    });

    this.audit.record(
      companyId,
      actor,
      "unit_price_item.measured",
      "UnitPriceItem",
      item.id,
      `Recorded ${input.measuredQuantity} ${item.unit} for "${item.description}"`,
    );
    return measurement;
  }

  async billingSummary(companyId: string, unitPriceItemId: string) {
    const item = await this.prisma.unitPriceItem.findFirst({
      where: { id: unitPriceItemId, companyId },
      include: { measurements: true },
    });
    if (!item) throw new NotFoundException("Unit-price item not found");

    return calculateUnitPriceBilling(
      item.measurements.map((m) => Number(m.measuredQuantity)),
      Number(item.contractUnitPrice),
      item.estimatedQuantity !== null ? Number(item.estimatedQuantity) : null,
    );
  }

  // T&M tickets

  listTMTickets(companyId: string, projectId: string) {
    return this.prisma.tMTicket.findMany({
      where: { companyId, projectId },
      orderBy: { ticketNumber: "desc" },
    });
  }

  async createTMTicket(companyId: string, actor: AuditActor, projectId: string, input: CreateTMTicketInput) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const existingCount = await this.prisma.tMTicket.count({ where: { projectId } });
    const ticket = await this.prisma.tMTicket.create({
      data: {
        companyId,
        projectId,
        ticketNumber: existingCount + 1,
        workDate: input.workDate,
        description: input.description,
        laborCost: input.laborCost,
        equipmentCost: input.equipmentCost,
        materialCost: input.materialCost,
      },
    });

    this.audit.record(companyId, actor, "tm_ticket.created", "TMTicket", ticket.id, `Created T&M ticket #${ticket.ticketNumber}`);
    return ticket;
  }

  async decideTMTicket(companyId: string, actor: AuditActor, id: string, input: DecideTMTicketInput) {
    const ticket = await this.prisma.tMTicket.findFirst({ where: { id, companyId } });
    if (!ticket) throw new NotFoundException("T&M ticket not found");
    if (ticket.status !== "draft") throw new BadRequestException("Only a draft T&M ticket can be decided");

    const updated = await this.prisma.tMTicket.update({
      where: { id },
      data: {
        status: input.status,
        ownerSignerName: input.ownerSignerName,
        signedAt: new Date(),
        disputeReason: input.status === "disputed" ? input.disputeReason : null,
      },
    });

    const verb = input.status === "approved" ? "Approved" : input.status === "disputed" ? "Disputed" : "Rejected";
    this.audit.record(
      companyId,
      actor,
      `tm_ticket.${input.status}`,
      "TMTicket",
      ticket.id,
      `${verb} T&M ticket #${ticket.ticketNumber} — signed by ${input.ownerSignerName}`,
    );
    return updated;
  }

  /** Edits a disputed ticket's cost/description and returns it to draft for another decideTMTicket() pass. */
  async reviseTMTicket(companyId: string, actor: AuditActor, id: string, input: ReviseTMTicketInput) {
    const ticket = await this.prisma.tMTicket.findFirst({ where: { id, companyId } });
    if (!ticket) throw new NotFoundException("T&M ticket not found");
    if (ticket.status !== "disputed") throw new BadRequestException("Only a disputed T&M ticket can be revised and resubmitted");

    const updated = await this.prisma.tMTicket.update({
      where: { id },
      data: {
        description: input.description,
        laborCost: input.laborCost,
        equipmentCost: input.equipmentCost,
        materialCost: input.materialCost,
        status: "draft",
        disputeReason: null,
        ownerSignerName: null,
        signedAt: null,
        revisionCount: { increment: 1 },
      },
    });

    this.audit.record(
      companyId,
      actor,
      "tm_ticket.revised",
      "TMTicket",
      ticket.id,
      `Revised and resubmitted T&M ticket #${ticket.ticketNumber} after dispute`,
    );
    return updated;
  }

  ticketTotal(ticket: { laborCost: unknown; equipmentCost: unknown; materialCost: unknown }): number {
    return calculateTMTicketTotal(Number(ticket.laborCost), Number(ticket.equipmentCost), Number(ticket.materialCost));
  }
}
