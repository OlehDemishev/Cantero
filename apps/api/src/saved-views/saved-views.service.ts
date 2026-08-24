import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateSavedViewInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class SavedViewsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string, userId: string, viewType: string) {
    return this.prisma.savedView.findMany({
      where: { companyId, userId, viewType },
      orderBy: { name: "asc" },
    });
  }

  /** Same name for the same view re-saves over the existing one, so "save" doubles as "update" without a separate rename/overwrite flow. */
  create(companyId: string, userId: string, input: CreateSavedViewInput) {
    return this.prisma.savedView.upsert({
      where: { userId_viewType_name: { userId, viewType: input.viewType, name: input.name } },
      create: { companyId, userId, viewType: input.viewType, name: input.name, filters: input.filters as never },
      update: { filters: input.filters as never },
    });
  }

  async delete(companyId: string, userId: string, id: string) {
    const view = await this.prisma.savedView.findFirst({ where: { id, companyId, userId } });
    if (!view) throw new NotFoundException("Saved view not found");
    await this.prisma.savedView.delete({ where: { id } });
    return { ok: true };
  }
}
