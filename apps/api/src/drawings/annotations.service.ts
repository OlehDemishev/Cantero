import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateAnnotationInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import type { AuditActor } from "../common/audit/audit.service";

@Injectable()
export class AnnotationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, drawingSheetId: string) {
    await this.assertSheet(companyId, drawingSheetId);
    return this.prisma.annotation.findMany({ where: { companyId, drawingSheetId }, orderBy: { createdAt: "asc" } });
  }

  async create(companyId: string, actor: AuditActor, drawingSheetId: string, input: CreateAnnotationInput) {
    await this.assertSheet(companyId, drawingSheetId);
    return this.prisma.annotation.create({
      data: {
        companyId,
        drawingSheetId,
        authorUserId: actor.userId,
        authorName: actor.name,
        type: input.type,
        points: input.points,
        color: input.color,
        text: input.text,
      },
    });
  }

  async delete(companyId: string, id: string) {
    const annotation = await this.prisma.annotation.findFirst({ where: { id, companyId } });
    if (!annotation) throw new NotFoundException("Annotation not found");
    await this.prisma.annotation.delete({ where: { id } });
    return { ok: true };
  }

  private async assertSheet(companyId: string, drawingSheetId: string) {
    const sheet = await this.prisma.drawingSheet.findFirst({ where: { id: drawingSheetId, companyId } });
    if (!sheet) throw new NotFoundException("Drawing sheet not found");
    return sheet;
  }
}
