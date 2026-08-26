import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService, type PdfTableRow } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { round2 } from "./progress-billing";

interface CostCodeBucket {
  code: string;
  name: string;
  scheduledValue: number;
}

const UNCATEGORIZED = { code: "—", name: "Uncategorized" };

/**
 * Generates a schedule-of-values / application-for-payment PDF for one progress-billing invoice —
 * the same shape as the industry-standard G702 (summary) + G703 (continuation sheet) forms, laid
 * out in this system's own design rather than reproducing AIA's copyrighted form artwork.
 * "Scheduled Value" per cost code is each code's share of the estimate's raw line total, scaled up
 * so the codes sum to the estimate's grandTotal (which is what progress draws are actually billed
 * against — see InvoicesService.generateProgressInvoice / calculateProgressDraw).
 */
@Injectable()
export class AiaBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfService,
    private readonly storage: StorageService,
  ) {}

  async generatePdf(companyId: string, invoiceId: string): Promise<Buffer> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId },
      include: { project: true, client: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (!invoice.estimateId || invoice.percentComplete == null) {
      throw new BadRequestException("Only a progress-billing invoice has a schedule of values");
    }

    const estimate = await this.prisma.estimate.findUniqueOrThrow({
      where: { id: invoice.estimateId },
      include: { lines: { include: { costCode: true } } },
    });
    const approvedChangeOrders = await this.prisma.changeOrder.findMany({
      where: { estimateId: estimate.id, status: "approved" },
      include: { lines: { include: { costCode: true } } },
    });

    const lastPriorDraw = await this.prisma.invoice.findFirst({
      where: {
        companyId,
        estimateId: estimate.id,
        isRetainageRelease: false,
        percentComplete: { lt: invoice.percentComplete },
        id: { not: invoice.id },
      },
      orderBy: { percentComplete: "desc" },
    });
    const previousPercent = lastPriorDraw ? Number(lastPriorDraw.percentComplete) : 0;
    const thisPercent = Number(invoice.percentComplete);
    const retainagePercent = Number(invoice.retainagePercent ?? 0);

    const buckets = new Map<string, CostCodeBucket>();
    const bucketFor = (costCode: { code: string; name: string } | null) => {
      const key = costCode?.code ?? UNCATEGORIZED.code;
      if (!buckets.has(key)) buckets.set(key, { code: key, name: costCode?.name ?? UNCATEGORIZED.name, scheduledValue: 0 });
      return buckets.get(key)!;
    };

    this.allocateScaledLines(
      estimate.lines.map((l) => ({ costCode: l.costCode, raw: Number(l.lineTotal) })),
      Number(estimate.grandTotal),
      bucketFor,
    );
    for (const co of approvedChangeOrders) {
      this.allocateScaledLines(
        co.lines.map((l) => ({ costCode: l.costCode, raw: Number(l.lineTotal) })),
        Number(co.grandTotal),
        bucketFor,
      );
    }

    const originalContractSum = Number(estimate.grandTotal);
    const changeOrdersSum = approvedChangeOrders.reduce((sum, co) => sum + Number(co.grandTotal), 0);
    const contractSumToDate = originalContractSum + changeOrdersSum;

    const rows: PdfTableRow[] = [];
    let totalCompletedToDate = 0;
    for (const bucket of Array.from(buckets.values()).sort((a, b) => a.code.localeCompare(b.code))) {
      const previousAmount = round2((bucket.scheduledValue * previousPercent) / 100);
      const totalToDate = round2((bucket.scheduledValue * thisPercent) / 100);
      const thisPeriod = round2(totalToDate - previousAmount);
      const balance = round2(bucket.scheduledValue - totalToDate);
      totalCompletedToDate += totalToDate;
      rows.push({
        cells: [
          bucket.code,
          bucket.name,
          bucket.scheduledValue.toFixed(2),
          previousAmount.toFixed(2),
          thisPeriod.toFixed(2),
          totalToDate.toFixed(2),
          `${thisPercent.toFixed(1)}%`,
          balance.toFixed(2),
        ],
      });
    }
    totalCompletedToDate = round2(totalCompletedToDate);
    const retainageAmount = round2((totalCompletedToDate * retainagePercent) / 100);
    const currentPaymentDue = round2(Number(invoice.total));

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey).catch(() => undefined) : undefined;

    return this.pdf.render({
      title: "Application for Payment",
      subtitle: `${company.name} — ${invoice.project.name}`,
      meta: [
        { label: "Invoice", value: invoice.number },
        { label: "Client", value: invoice.client.name },
        { label: "Application date", value: invoice.createdAt.toISOString().slice(0, 10) },
        { label: "Period to", value: `${thisPercent.toFixed(1)}% complete` },
      ],
      tableHeader: ["Code", "Description", "Scheduled Value", "Previous", "This Period", "To Date", "%", "Balance"],
      tableRows: rows,
      totals: [
        { label: "Original contract sum", value: originalContractSum.toFixed(2) },
        { label: "Net change by change orders", value: changeOrdersSum.toFixed(2) },
        { label: "Contract sum to date", value: contractSumToDate.toFixed(2) },
        { label: "Total completed & stored to date", value: totalCompletedToDate.toFixed(2) },
        { label: `Retainage (${retainagePercent}%)`, value: retainageAmount.toFixed(2) },
        { label: "Current payment due", value: currentPaymentDue.toFixed(2), emphasize: true },
      ],
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
    });
  }

  /** Scales each line's raw (pre-markup/tax) total so the group sums exactly to `scaledTotal`
   * (the document's actual grandTotal), then adds each scaled share into its cost-code bucket. */
  private allocateScaledLines(
    lines: { costCode: { code: string; name: string } | null; raw: number }[],
    scaledTotal: number,
    bucketFor: (costCode: { code: string; name: string } | null) => CostCodeBucket,
  ): void {
    const rawTotal = lines.reduce((sum, l) => sum + l.raw, 0);
    const scale = rawTotal > 0 ? scaledTotal / rawTotal : 0;
    for (const line of lines) {
      bucketFor(line.costCode).scheduledValue += round2(line.raw * scale);
    }
  }
}
