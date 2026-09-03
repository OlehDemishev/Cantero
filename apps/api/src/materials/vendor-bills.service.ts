import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateVendorBillInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { matchVendorBill } from "./vendor-bill-match";
import { calculateApAging } from "./ap-aging";

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
    const updated = await this.prisma.vendorBill.update({
      where: { id },
      data: { status: "approved", approvedAt: new Date(), approvedByName: actor.name },
      include: INCLUDE,
    });
    this.audit.record(companyId, actor, "vendor_bill.approved", "VendorBill", id, `Approved bill ${bill.billNumber}`);
    return this.withMatch(updated);
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
