import { Injectable, NotFoundException } from "@nestjs/common";
import { PROGRESS_VARIANCE_THRESHOLD_PERCENT } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { estimateProgressFromPhotos } from "./estimate-progress";

@Injectable()
export class ProgressTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  history(companyId: string, projectId: string) {
    return this.prisma.progressEstimate.findMany({ where: { companyId, projectId }, orderBy: { computedAt: "desc" } });
  }

  /**
   * Reads the project's uploaded `photo`-category Document tags, runs the keyword heuristic, and
   * compares the result against the most recent progress-billing draw's Invoice.percentComplete
   * for the same project — flagging a variance beyond PROGRESS_VARIANCE_THRESHOLD_PERCENT so a PM
   * can sanity-check either the billing or the field photos before the next draw goes out.
   */
  async computeAndSnapshot(companyId: string, actor: AuditActor, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const [photos, lastBilledInvoice] = await Promise.all([
      this.prisma.document.findMany({ where: { companyId, projectId, category: "photo", deletedAt: null }, select: { tags: true } }),
      this.prisma.invoice.findFirst({
        where: { companyId, projectId, percentComplete: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { percentComplete: true },
      }),
    ]);

    const { estimatedPercentComplete, matchedKeywords, photoCount } = estimateProgressFromPhotos(photos);
    const billedPercentComplete = lastBilledInvoice?.percentComplete ?? null;
    const varianceFlagged =
      billedPercentComplete !== null && Math.abs(estimatedPercentComplete - Number(billedPercentComplete)) > PROGRESS_VARIANCE_THRESHOLD_PERCENT;

    const estimate = await this.prisma.progressEstimate.create({
      data: {
        companyId,
        projectId,
        estimatedPercentComplete,
        matchedKeywords,
        photoCount,
        billedPercentComplete: billedPercentComplete ?? undefined,
        varianceFlagged,
      },
    });

    this.audit.record(
      companyId,
      actor,
      "progress_estimate.computed",
      "ProgressEstimate",
      estimate.id,
      `Estimated ${estimatedPercentComplete}% complete on "${project.name}" from ${photoCount} photo(s)` +
        (varianceFlagged ? ` — flagged: billed at ${billedPercentComplete}%` : ""),
    );
    return estimate;
  }
}
