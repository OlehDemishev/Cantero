import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateVendorBillInput, SchedulePaymentInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { GobdLedgerService } from "../common/gobd/gobd-ledger.service";
import { runSerializable } from "../common/prisma/serializable-transaction";
import { matchVendorBill } from "./vendor-bill-match";
import { calculateApAging } from "./ap-aging";
import { calculateDisbursementCalendar } from "./disbursement-calendar";
import { assertSageBillsExportable, buildSage300CreApInvoices } from "./sage-300-cre";

const DISBURSEMENT_CALENDAR_WEEKS = 8;

const INCLUDE = {
  supplier: true,
  purchaseOrder: { include: { lines: true } },
  lines: { include: { materialCatalogItem: true } },
} as const;

@Injectable()
export class VendorBillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly gobdLedger: GobdLedgerService,
  ) {}

  async list(companyId: string) {
    const bills = await this.prisma.vendorBill.findMany({
      where: { companyId },
      include: INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    return bills.map((bill) => this.withMatch(bill));
  }

  async get(companyId: string, id: string) {
    const bill = await this.findOrThrow(companyId, id);
    return this.withMatch(bill);
  }

  async create(companyId: string, actor: AuditActor, input: CreateVendorBillInput) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: input.supplierId, companyId } });
    if (!supplier) throw new NotFoundException("Supplier not found");

    if (input.purchaseOrderId) {
      const po = await this.prisma.purchaseOrder.findFirst({
        where: { id: input.purchaseOrderId, companyId, supplierId: input.supplierId },
      });
      if (!po) throw new BadRequestException("Purchase order not found for this supplier");
    }

    const materialIds = [...new Set(input.lines.map((l) => l.materialCatalogItemId).filter((id): id is string => !!id))];
    if (materialIds.length > 0) {
      const owned = await this.prisma.materialCatalogItem.count({ where: { id: { in: materialIds }, companyId } });
      if (owned !== materialIds.length) throw new BadRequestException("One or more materials do not belong to this company");
    }

    const bill = await this.prisma.vendorBill.create({
      data: {
        companyId,
        supplierId: input.supplierId,
        purchaseOrderId: input.purchaseOrderId,
        billNumber: input.billNumber,
        billDate: input.billDate ? new Date(input.billDate) : undefined,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        notes: input.notes,
        lines: {
          create: input.lines.map((l) => ({
            materialCatalogItemId: l.materialCatalogItemId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
        },
      },
      include: INCLUDE,
    });
    this.audit.record(companyId, actor, "vendor_bill.created", "VendorBill", bill.id, `Recorded bill ${input.billNumber} from ${supplier.name}`);
    return this.withMatch(bill);
  }

  async approve(companyId: string, actor: AuditActor, id: string) {
    const bill = await this.findOrThrow(companyId, id);
    if (bill.status !== "draft") throw new BadRequestException("Only a draft bill can be approved");
    const approvedAt = new Date();
    const updated = await runSerializable(this.prisma, async (tx) => {
      const updated = await tx.vendorBill.update({
        where: { id },
        data: { status: "approved", approvedAt, approvedByName: actor.name, lockedAt: approvedAt },
        include: INCLUDE,
      });
      await this.gobdLedger.append(
        tx,
        companyId,
        actor,
        "vendor_bill.locked",
        "VendorBill",
        id,
        `GoBD Festschreibung: locked bill ${bill.billNumber} at approval`,
        {
          billNumber: bill.billNumber,
          supplierId: bill.supplierId,
          lines: bill.lines.map((l) => ({ description: l.description, quantity: l.quantity.toString(), unitPrice: l.unitPrice.toString() })),
        },
      );
      return updated;
    });
    this.audit.record(companyId, actor, "vendor_bill.approved", "VendorBill", id, `Approved bill ${bill.billNumber}`);
    return this.withMatch(updated);
  }

  /**
   * GoBD-compliant correction for an approved/paid bill: never edits or deletes it, only marks it
   * void with a documented reason. Unlike Invoice.void(), no reversal document is auto-generated —
   * we don't issue bills to ourselves, so a corrected bill from the supplier is entered as its own
   * fresh VendorBill instead.
   */
  async void(companyId: string, actor: AuditActor, id: string, reason: string) {
    const bill = await this.findOrThrow(companyId, id);
    if (!bill.lockedAt) {
      throw new BadRequestException("Only a locked (approved or paid) bill needs a correction — a draft can simply be edited or deleted upstream.");
    }
    if (bill.status === "void") throw new BadRequestException("This bill has already been voided");

    const voidedAt = new Date();
    const updated = await runSerializable(this.prisma, async (tx) => {
      const updated = await tx.vendorBill.update({
        where: { id },
        data: { status: "void", voidedAt, voidReason: reason },
        include: INCLUDE,
      });
      await this.gobdLedger.append(tx, companyId, actor, "vendor_bill.voided", "VendorBill", id, `GoBD correction: voided bill ${bill.billNumber} — ${reason}`, {
        billNumber: bill.billNumber,
        reason,
      });
      return updated;
    });
    this.audit.record(companyId, actor, "vendor_bill.voided", "VendorBill", id, `Voided bill ${bill.billNumber}: ${reason}`);
    return this.withMatch(updated);
  }

  /** Sets when the office plans to actually pay an approved bill — independent of the vendor's own dueDate. */
  async schedulePayment(companyId: string, actor: AuditActor, id: string, input: SchedulePaymentInput) {
    const bill = await this.findOrThrow(companyId, id);
    if (bill.status !== "approved") throw new BadRequestException("Only an approved bill can have its payment scheduled");

    const updated = await this.prisma.vendorBill.update({
      where: { id },
      data: { scheduledPaymentDate: new Date(input.scheduledPaymentDate) },
      include: INCLUDE,
    });
    this.audit.record(
      companyId,
      actor,
      "vendor_bill.payment_scheduled",
      "VendorBill",
      id,
      `Scheduled payment for bill ${bill.billNumber} on ${input.scheduledPaymentDate.slice(0, 10)}`,
    );
    return this.withMatch(updated);
  }

  /** Weekly cash-outflow view of approved-unpaid bills — see disbursement-calendar.ts. */
  async disbursementCalendar(companyId: string) {
    const bills = await this.prisma.vendorBill.findMany({
      where: { companyId, status: "approved" },
      include: { supplier: { select: { name: true } }, lines: true },
    });
    return calculateDisbursementCalendar(
      bills.map((b) => ({
        id: b.id,
        billNumber: b.billNumber,
        supplierName: b.supplier.name,
        amount: Math.round(b.lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitPrice), 0) * 100) / 100,
        paymentDate: b.scheduledPaymentDate ?? b.dueDate,
      })),
      DISBURSEMENT_CALENDAR_WEEKS,
      new Date(),
    );
  }

  async markPaid(companyId: string, actor: AuditActor, id: string) {
    const bill = await this.findOrThrow(companyId, id);
    if (bill.status !== "approved") throw new BadRequestException("Only an approved bill can be marked paid");
    const updated = await this.prisma.vendorBill.update({
      where: { id },
      data: { status: "paid", paidAt: new Date() },
      include: INCLUDE,
    });
    this.audit.record(companyId, actor, "vendor_bill.paid", "VendorBill", id, `Marked bill ${bill.billNumber} paid`);
    return this.withMatch(updated);
  }

  /** Approved and paid bills (never drafts or voids) as a Sage 300 CRE AP "Import Invoices" file —
   * see sage-300-cre.ts for the format and what it deliberately leaves blank. Refuses the whole
   * export, naming every offender, rather than silently dropping bills Sage would have rejected. */
  async exportSage300Cre(
    companyId: string,
    actor: AuditActor,
    options: { from?: Date; to?: Date; expenseAccount?: string; apAccount?: string },
  ): Promise<string> {
    const bills = await this.prisma.vendorBill.findMany({
      where: {
        companyId,
        status: { in: ["approved", "paid"] },
        ...(options.from || options.to ? { billDate: { ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lte: options.to } : {}) } } : {}),
      },
      include: { supplier: true, lines: true },
      orderBy: { billDate: "asc" },
    });
    if (bills.length === 0) throw new BadRequestException("No approved or paid bills to export for that period");

    const exportable = bills.map((b) => ({
      billNumber: b.billNumber,
      billDate: b.billDate,
      dueDate: b.dueDate,
      scheduledPaymentDate: b.scheduledPaymentDate,
      notes: b.notes,
      supplierName: b.supplier.name,
      sageVendorId: b.supplier.sageVendorId,
      lines: b.lines.map((l) => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
    }));
    try {
      assertSageBillsExportable(exportable);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : "Bills can't be exported");
    }
    this.audit.record(companyId, actor, "vendor_bill.exported_sage", "VendorBill", bills[0].id, `Exported ${bills.length} bill(s) to a Sage 300 CRE import file`);
    return buildSage300CreApInvoices(exportable, { expenseAccount: options.expenseAccount, apAccount: options.apAccount });
  }

  async agingReport(companyId: string) {
    const bills = await this.prisma.vendorBill.findMany({
      where: { companyId, status: { in: ["draft", "approved"] } },
      include: { supplier: { select: { name: true } }, lines: true },
    });
    return calculateApAging(
      bills.map((b) => ({
        id: b.id,
        billNumber: b.billNumber,
        supplierName: b.supplier.name,
        amount: Math.round(b.lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unitPrice), 0) * 100) / 100,
        dueDate: b.dueDate,
      })),
      new Date(),
    );
  }

  private withMatch<T extends { purchaseOrder: { lines: { materialCatalogItemId: string; quantity: unknown; unitPrice: unknown }[] } | null; lines: { materialCatalogItemId: string | null; quantity: unknown; unitPrice: unknown }[] }>(
    bill: T,
  ) {
    const poLines = bill.purchaseOrder
      ? bill.purchaseOrder.lines.map((l) => ({
          materialCatalogItemId: l.materialCatalogItemId,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
        }))
      : null;
    const billLines = bill.lines
      .filter((l): l is typeof l & { materialCatalogItemId: string } => l.materialCatalogItemId !== null)
      .map((l) => ({ materialCatalogItemId: l.materialCatalogItemId, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) }));
    return { ...bill, match: matchVendorBill(poLines, billLines) };
  }

  private async findOrThrow(companyId: string, id: string) {
    const bill = await this.prisma.vendorBill.findFirst({ where: { id, companyId }, include: INCLUDE });
    if (!bill) throw new NotFoundException("Vendor bill not found");
    return bill;
  }
}
