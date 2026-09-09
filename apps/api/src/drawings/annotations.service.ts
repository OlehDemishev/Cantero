import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateAnnotationInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import type { AuditActor } from "../common/audit/audit.service";

/** Not cursor-paginated: annotations are pins/shapes drawn directly onto one drawing sheet image
 * — the viewer needs every markup on the sheet to render correctly, not a page of them. Bounded
 * by how many markups fit meaningfully on one sheet (naturally small), so this is a backstop, not
 * an expected page size. */
const ANNOTATIONS_QUERY_CAP = 2000;

@Injectable()
export class AnnotationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, drawingSheetId: string) {
    await this.assertSheet(companyId, drawingSheetId);
    return this.prisma.annotation.findMany({
      where: { companyId, drawingSheetId },
      orderBy: { createdAt: "asc" },
      take: ANNOTATIONS_QUERY_CAP,
    });
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
