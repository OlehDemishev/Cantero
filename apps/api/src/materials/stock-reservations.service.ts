import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateStockReservationInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

const STOCK_RESERVATIONS_INCLUDE = {
  materialCatalogItem: { select: { id: true, code: true, name: true, unit: true } },
  warehouse: { select: { id: true, name: true } },
  project: { select: { id: true, name: true } },
} as const;

/**
 * Purely informational holds against a material's on-hand quantity — see StockService.listLevels'
 * `reserved`/`available` fields. Reservations never block recordMovement/transferStock/
 * issueFromEstimate; over-reserving (more than what's on hand) is allowed and meaningful (e.g. two
 * competing bids both earmarking the same lot).
 */
@Injectable()
export class StockReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string, warehouseId?: string, materialCatalogItemId?: string, cursor?: string) {
    return this.prisma.stockReservation.findMany({
      where: {
        companyId,
        ...(warehouseId ? { warehouseId } : {}),
        ...(materialCatalogItemId ? { materialCatalogItemId } : {}),
      },
      include: STOCK_RESERVATIONS_INCLUDE,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
  }

  async create(companyId: string, createdByName: string, input: CreateStockReservationInput) {
    const [warehouse, material] = await Promise.all([
      this.prisma.warehouse.findFirst({ where: { id: input.warehouseId, companyId } }),
      this.prisma.materialCatalogItem.findFirst({ where: { id: input.materialCatalogItemId, companyId } }),
    ]);
    if (!warehouse) throw new NotFoundException("Warehouse not found");
    if (!material) throw new NotFoundException("Material not found");

    if (input.projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
      if (!project) throw new NotFoundException("Project not found");
    }

    return this.prisma.stockReservation.create({
      data: {
        companyId,
        warehouseId: input.warehouseId,
        materialCatalogItemId: input.materialCatalogItemId,
        quantity: input.quantity,
        projectId: input.projectId,
        note: input.note,
        createdByName,
      },
      include: STOCK_RESERVATIONS_INCLUDE,
    });
  }

  async release(companyId: string, id: string) {
    const reservation = await this.prisma.stockReservation.findFirst({ where: { id, companyId } });
    if (!reservation) throw new NotFoundException("Reservation not found");
    if (reservation.status === "released") throw new BadRequestException("Reservation is already released");

    return this.prisma.stockReservation.update({
      where: { id },
      data: { status: "released", releasedAt: new Date() },
      include: STOCK_RESERVATIONS_INCLUDE,
    });
  }
}
