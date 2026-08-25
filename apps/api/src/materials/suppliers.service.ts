import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateSupplierInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.supplier.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  }

  async get(companyId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, companyId } });
    if (!supplier) throw new NotFoundException("Supplier not found");
    return supplier;
  }

  create(companyId: string, input: CreateSupplierInput) {
    return this.prisma.supplier.create({ data: { ...input, companyId } });
  }

  /** On-time rate and spend, computed from every received purchase order — "on time" means
   * received at or before the promised expectedDate. Orders with no expectedDate or not yet
   * received are excluded from the on-time rate but still counted in totalOrders/totalSpend. */
  async scorecard(companyId: string, id: string) {
    await this.get(companyId, id);

    const orders = await this.prisma.purchaseOrder.findMany({
      where: { companyId, supplierId: id },
      include: { lines: true },
    });

    const received = orders.filter((o) => o.receivedAt);
    const withPromise = received.filter((o) => o.expectedDate);
    const onTime = withPromise.filter((o) => o.receivedAt! <= o.expectedDate!);
    const delaysDays = withPromise.map((o) => (o.receivedAt!.getTime() - o.expectedDate!.getTime()) / 86_400_000);

    const totalSpend = orders.reduce(
      (sum, o) => sum + o.lines.reduce((lineSum, l) => lineSum + Number(l.quantity) * Number(l.unitPrice), 0),
      0,
    );

    return {
      totalOrders: orders.length,
      receivedOrders: received.length,
      totalSpend,
      onTimeRate: withPromise.length > 0 ? onTime.length / withPromise.length : null,
      averageDelayDays: delaysDays.length > 0 ? delaysDays.reduce((a, b) => a + b, 0) / delaysDays.length : null,
    };
  }
}
