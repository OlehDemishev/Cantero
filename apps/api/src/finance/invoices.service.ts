import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type Locale } from "@prisma/client";
import type { AddInstallmentInput, GenerateProgressInvoiceInput, RecordPaymentInput, ReleaseRetainageInput, UpdateInvoiceInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService, type PdfDocumentSpec } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { toCsv } from "../common/csv";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { OutboxService } from "../common/webhooks/outbox.service";
import { calculateProgressDraw, round2 } from "./progress-billing";
import { buildXRechnungXml, type BuildXRechnungXmlInput } from "./e-invoice";
import { buildZugferdCiiXml } from "./zugferd";
import { buildDatevHeader, buildDatevPostingRow, buildDatevBuchungsstapelCsv, resolveDatevFiscalYearStart } from "./datev";
import { buildPeppolBisXml } from "./peppol";
import { PeppolAccessPointService } from "./peppol-access-point.service";
import { calculateLateFee, daysOverdue } from "./late-fee";
import { documentPdfLabels } from "../common/pdf/pdf-labels";
import { invoiceSentEmail } from "../common/mail/client-mail-templates";
import { ExchangeRateService } from "../common/exchange-rate/exchange-rate.service";
import { calculateFxSettlement } from "./fx-settlement";
import { createInvoiceWithNumber } from "./invoice-numbering";
import { runSerializable } from "../common/prisma/serializable-transaction";
import { GobdLedgerService } from "../common/gobd/gobd-ledger.service";
import { ProjectAccessService, type ProjectViewer } from "../common/project-access/project-access.service";

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly outbox: OutboxService,
    private readonly exchangeRates: ExchangeRateService,
    private readonly peppolAccessPoint: PeppolAccessPointService,
    private readonly gobdLedger: GobdLedgerService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  /** take omitted (public-api's JSON export, out of scope for this round's pagination pass —
   * paginates client-side via its own paginate() helper instead) returns every invoice, same as
   * before pagination existed here. */
  async list(companyId: string, take?: number, cursor?: string, viewer: ProjectViewer = {}) {
    const visible = await this.projectAccess.visibleWhere(companyId, "Invoice", viewer.userId, viewer.role);
    return this.prisma.invoice.findMany({
      where: { AND: [{ companyId }, visible] },
      include: { client: true, project: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(take !== undefined ? { take } : {}),
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
  }

  async get(companyId: string, id: string) {
    const invoice = await this.findOrThrow(companyId, id);
    return { ...invoice, lateFeeAccrued: await this.computeLateFeeAccrued(companyId, invoice) };
  }

  /** Live-computed, never stored — a company's rate can change, and a settled invoice shouldn't
   * keep accruing, so this is recalculated on every read rather than cached. Only ever billed for
   * real once chargeLateFee() adds it as an actual line. Accrues only from the last charge
   * forward (or from dueDate if never charged), against the principal balance with previously
   * charged late fees backed out — otherwise a second charge on the same day would recompute the
   * fee over the whole overdue period again, and on a balance that already includes the first
   * charge, compounding it. */
  private async computeLateFeeAccrued(
    companyId: string,
    invoice: {
      status: string;
      dueDate: Date | null;
      total: unknown;
      lateFeeChargedTotal: unknown;
      lastLateFeeAccrualAt: Date | null;
      payments: { amount: unknown }[];
    },
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<number> {
    if (invoice.status !== "sent" || !invoice.dueDate) return 0;
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { lateFeePercentPerMonth: true } });
    if (!company.lateFeePercentPerMonth) return 0;

    const paid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const principalOutstanding = Number(invoice.total) - Number(invoice.lateFeeChargedTotal ?? 0) - paid;
    const accrualStart = invoice.lastLateFeeAccrualAt ?? invoice.dueDate;
    const overdue = daysOverdue(accrualStart, new Date());
    return calculateLateFee(principalOutstanding, overdue, Number(company.lateFeePercentPerMonth));
  }

  /** Locks in the currently-accrued late fee as a real InvoiceLine, so it actually gets billed —
   * chargeable again later as more time passes, each time adding only the newly-accrued portion
   * since this charge. The read (accrual computation) and the two writes (line + invoice update)
   * all run inside one serializable transaction — otherwise two concurrent charge requests could
   * each read the same "accrued so far" snapshot, both pass the > 0 check, and both post a line,
   * double-charging the fee. */
  async chargeLateFee(companyId: string, actor: AuditActor, id: string) {
    const { updated, invoiceNumber, accrued } = await runSerializable(this.prisma, async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id, companyId },
        include: { lines: true, client: true, project: true, payments: true, installments: { orderBy: { sortOrder: "asc" } } },
      });
      if (!invoice) throw new NotFoundException("Invoice not found");

      const accrued = await this.computeLateFeeAccrued(companyId, invoice, tx);
      if (accrued <= 0) {
        throw new BadRequestException("No late fee has accrued on this invoice");
      }

      await tx.invoiceLine.create({
        data: { invoiceId: id, description: "Late fee", quantity: 1, unitPrice: accrued, lineTotal: accrued },
      });
      const updated = await tx.invoice.update({
        where: { id },
        data: { total: { increment: accrued }, lateFeeChargedTotal: { increment: accrued }, lastLateFeeAccrualAt: new Date() },
        include: { lines: true, client: true, project: true, payments: true, installments: true },
      });
      return { updated, invoiceNumber: invoice.number, accrued };
    });

    this.audit.record(companyId, actor, "invoice.late_fee_charged", "Invoice", id, `Charged a ${accrued} late fee on invoice ${invoiceNumber}`);
    return updated;
  }

  /** Generates an Invoice + InvoiceLines pre-filled from an approved estimate's totals. */
  async generateFromEstimate(companyId: string, estimateId: string) {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id: estimateId, companyId },
      include: { lines: true, project: true },
    });
    if (!estimate) throw new NotFoundException("Estimate not found");
    if (!estimate.project) {
      throw new NotFoundException("Estimate has no project — templates can't be invoiced directly");
    }
    if (!estimate.project.clientId) {
      throw new NotFoundException("Project has no client — add a client before invoicing");
    }
    if (estimate.status !== "approved") {
      throw new NotFoundException("Estimate must be approved before it can be invoiced");
    }

    const rateItems = await this.prisma.rateCatalogItem.findMany({
      where: { id: { in: estimate.lines.map((l) => l.rateCatalogItemId) }, companyId },
    });
    const rateItemsById = Object.fromEntries(rateItems.map((ri) => [ri.id, ri]));

    const invoice = await createInvoiceWithNumber(this.prisma, companyId, (number) =>
      this.prisma.invoice.create({
        data: {
          companyId,
          projectId: estimate.project!.id,
          clientId: estimate.project!.clientId!,
          estimateId: estimate.id,
          number,
          status: "draft",
          currency: estimate.currency,
          subtotal: estimate.subtotal.add(estimate.markupAmount),
          taxAmount: estimate.taxAmount,
          total: estimate.grandTotal,
          lines: {
            create: estimate.lines.map((line) => ({
              description: rateItemsById[line.rateCatalogItemId]?.name ?? line.rateCatalogItemId,
              quantity: line.quantity,
              unitPrice: line.quantity.isZero() ? 0 : line.lineTotal.div(line.quantity),
              lineTotal: line.lineTotal,
            })),
          },
        },
        include: { lines: true, client: true, project: true },
      }),
    );

    return invoice;
  }

  /** Generates one progress-billing draw against an estimate, withholding retainage on the incremental amount billed since the last draw. */
  async generateProgressInvoice(companyId: string, estimateId: string, input: GenerateProgressInvoiceInput) {
    const estimate = await this.assertInvoiceableEstimate(companyId, estimateId);

    const lastDraw = await this.prisma.invoice.findFirst({
      where: { companyId, estimateId, isRetainageRelease: false, percentComplete: { not: null }, status: { not: "void" } },
      orderBy: { percentComplete: "desc" },
    });
    const previousPercent = lastDraw ? Number(lastDraw.percentComplete) : 0;
    if (input.percentComplete <= previousPercent) {
      throw new BadRequestException(`Percent complete must be greater than the last draw's ${previousPercent}%`);
    }

    const calc = calculateProgressDraw(Number(estimate.grandTotal), previousPercent, input.percentComplete, input.retainagePercent);

    return createInvoiceWithNumber(this.prisma, companyId, (number) =>
      this.prisma.invoice.create({
        data: {
          companyId,
          projectId: estimate.project!.id,
          clientId: estimate.project!.clientId!,
          estimateId: estimate.id,
          number,
          status: "draft",
          currency: estimate.currency,
          subtotal: calc.grossAmount,
          taxAmount: 0,
          total: calc.netAmount,
          percentComplete: input.percentComplete,
          retainagePercent: input.retainagePercent,
          retainageAmount: calc.retainageAmount,
          lines: {
            create: [
              {
                description: `Progress billing — ${previousPercent}% → ${input.percentComplete}% complete`,
                quantity: 1,
                unitPrice: calc.grossAmount,
                lineTotal: calc.grossAmount,
              },
            ],
          },
        },
        include: { lines: true, client: true, project: true },
      }),
    );
  }

  /** Pays out all retainage withheld across an estimate's progress draws in one final invoice. Can only be done once per estimate. */
  /** Retainage can be released in stages (e.g. half at substantial completion, the rest after
   * final punch-list/lien-waiver) — each call generates its own release invoice for `input.amount`,
   * capped at whatever's still held. Omitting amount releases everything still remaining, the
   * original all-or-nothing behavior, so a plain "release retainage" click still works unchanged. */
  async releaseRetainage(companyId: string, estimateId: string, input: ReleaseRetainageInput) {
    const estimate = await this.assertInvoiceableEstimate(companyId, estimateId);

    const [progressDraws, releaseInvoices] = await Promise.all([
      this.prisma.invoice.findMany({ where: { companyId, estimateId, isRetainageRelease: false, status: { not: "void" } } }),
      this.prisma.invoice.findMany({ where: { companyId, estimateId, isRetainageRelease: true, status: { not: "void" } } }),
    ]);
    const totalHeld = round2(progressDraws.reduce((sum, inv) => sum + Number(inv.retainageAmount), 0));
    const alreadyReleased = round2(releaseInvoices.reduce((sum, inv) => sum + Number(inv.total), 0));
    const remaining = round2(totalHeld - alreadyReleased);
    if (remaining <= 0) throw new BadRequestException("No retainage remains to release on this estimate");

    const amount = input.amount ?? remaining;
    if (amount > remaining) throw new BadRequestException(`Only ${remaining} of retainage remains to release`);

    return createInvoiceWithNumber(this.prisma, companyId, (number) =>
      this.prisma.invoice.create({
        data: {
          companyId,
          projectId: estimate.project!.id,
          clientId: estimate.project!.clientId!,
          estimateId: estimate.id,
          number,
          status: "draft",
          currency: estimate.currency,
          subtotal: amount,
          taxAmount: 0,
          total: amount,
          isRetainageRelease: true,
          lines: { create: [{ description: "Retainage release", quantity: 1, unitPrice: amount, lineTotal: amount }] },
        },
        include: { lines: true, client: true, project: true },
      }),
    );
  }

  async progressBillingSummary(companyId: string, estimateId: string) {
    const estimate = await this.prisma.estimate.findFirst({ where: { id: estimateId, companyId } });
    if (!estimate) throw new NotFoundException("Estimate not found");

    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, estimateId, OR: [{ percentComplete: { not: null } }, { isRetainageRelease: true }] },
      orderBy: { createdAt: "asc" },
    });
    // Voided draws/releases stay in the returned `invoices` list (so the UI can still show what
    // happened to them) but are excluded from every aggregate below — a voided invoice was never
    // actually billed or paid, so it shouldn't count as retainage held or released.
    const progressDraws = invoices.filter((i) => !i.isRetainageRelease && i.status !== "void");
    const releaseInvoices = invoices.filter((i) => i.isRetainageRelease && i.status !== "void");
    const percentBilled = progressDraws.length ? Math.max(...progressDraws.map((i) => Number(i.percentComplete))) : 0;
    const totalRetainageHeld = round2(progressDraws.reduce((sum, i) => sum + Number(i.retainageAmount), 0));
    const retainageReleasedTotal = round2(releaseInvoices.reduce((sum, i) => sum + Number(i.total), 0));

    return {
      contractTotal: Number(estimate.grandTotal),
      percentBilled,
      totalBilledGross: round2(progressDraws.reduce((sum, i) => sum + Number(i.subtotal), 0)),
      totalRetainageHeld,
      retainageReleasedTotal,
      retainageRemaining: round2(totalRetainageHeld - retainageReleasedTotal),
      invoices: invoices.map((i) => ({
        id: i.id,
        number: i.number,
        status: i.status,
        percentComplete: i.percentComplete !== null ? Number(i.percentComplete) : null,
        retainageAmount: Number(i.retainageAmount),
        total: Number(i.total),
        isRetainageRelease: i.isRetainageRelease,
      })),
    };
  }

  async send(companyId: string, actor: AuditActor, id: string) {
    const invoice = await this.findOrThrow(companyId, id);
    if (invoice.status !== "draft") {
      throw new BadRequestException("Only a draft invoice can be sent");
    }

    let dueDate = invoice.dueDate;
    if (!dueDate) {
      const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { defaultPaymentTermsDays: true } });
      const termsDays = invoice.client.paymentTermsDays ?? company.defaultPaymentTermsDays;
      dueDate = new Date(Date.now() + termsDays * 24 * 60 * 60 * 1000);
    }

    const lockedAt = new Date();
    const updated = await runSerializable(this.prisma, async (tx) => {
      const updated = await tx.invoice.update({
        where: { id },
        data: { status: "sent", dueDate, lockedAt },
        include: { lines: true, client: true, project: true, payments: true, installments: true },
      });
      await this.outbox.enqueue(tx, companyId, "invoice.sent", { invoiceId: id, number: invoice.number });
      await this.gobdLedger.append(tx, companyId, actor, "invoice.locked", "Invoice", id, `GoBD Festschreibung: locked invoice ${invoice.number} at send`, {
        number: invoice.number,
        subtotal: invoice.subtotal.toString(),
        taxAmount: invoice.taxAmount.toString(),
        total: invoice.total.toString(),
        currency: invoice.currency,
        dueDate: dueDate.toISOString(),
        lines: invoice.lines.map((l) => ({ description: l.description, quantity: l.quantity.toString(), unitPrice: l.unitPrice.toString(), lineTotal: l.lineTotal.toString() })),
      });
      return updated;
    });
    this.audit.record(companyId, actor, "invoice.sent", "Invoice", id, `Sent invoice ${invoice.number} to ${invoice.client.name}`);

    const emailSentTo = updated.client.email
      ? await this.sendInvoicePdfEmail(companyId, updated).then(() => updated.client.email)
      : null;

    return { ...updated, emailSentTo };
  }

  /** Generates the invoice's PDF and emails it to the client, if they have an email on file —
   * shared by send() and the auto-generated Stornorechnung in void(), since both need to put a
   * newly-locked invoice PDF in front of the client the same way. */
  private async sendInvoicePdfEmail(
    companyId: string,
    invoice: { id: string; number: string; total: Prisma.Decimal; currency: string; client: { email: string | null; preferredLocale: Locale | null } },
  ): Promise<void> {
    if (!invoice.client.email) return;
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const pdf = await this.generatePdf(companyId, invoice.id);
    const email = invoiceSentEmail(invoice.client.preferredLocale ?? company.locale, company.name, invoice.number, invoice.total.toString(), invoice.currency);
    this.mail.send({
      to: invoice.client.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: [{ filename: `${invoice.number}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
  }

  async update(companyId: string, id: string, input: UpdateInvoiceInput) {
    const invoice = await this.findOrThrow(companyId, id);
    if (invoice.lockedAt) {
      throw new BadRequestException(
        "This invoice was locked under GoBD Festschreibung when it was sent and can no longer be edited — void it and issue a correction instead.",
      );
    }
    return this.prisma.invoice.update({
      where: { id },
      data: { dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null },
      include: { lines: true, client: true, project: true, payments: true, installments: true },
    });
  }

  /**
   * GoBD-compliant correction: never edits or deletes a locked invoice. Instead marks it void and
   * issues a brand-new Stornorechnung (credit note) with the exact negation of every line, its own
   * sequential number, sent immediately. Both the void and the correction's issuance are recorded
   * in the tamper-evident ledger, inside the same serializable transaction as the writes.
   */
  async void(companyId: string, actor: AuditActor, id: string, reason: string) {
    const invoice = await this.findOrThrow(companyId, id);
    if (!invoice.lockedAt) {
      throw new BadRequestException("Only a locked (sent or paid) invoice needs a correction — a draft can simply be edited or left alone.");
    }
    if (invoice.status === "void") {
      throw new BadRequestException("This invoice has already been voided");
    }

    const voidedAt = new Date();
    // createInvoiceWithNumber retries on a number clash by re-invoking create() with a freshly
    // recomputed number — each attempt opens its own fresh serializable transaction (rather than
    // sharing one across attempts) so a failed attempt's create() aborts and rolls back cleanly,
    // including the void-status update, instead of leaving a poisoned transaction to retry into.
    const correction = await createInvoiceWithNumber(this.prisma, companyId, (number) =>
      runSerializable(this.prisma, async (tx) => {
        await tx.invoice.update({ where: { id }, data: { status: "void", voidedAt, voidReason: reason } });
        const created = await tx.invoice.create({
          data: {
            companyId,
            projectId: invoice.projectId,
            clientId: invoice.clientId,
            number,
            status: "sent",
            subtotal: invoice.subtotal.negated(),
            taxAmount: invoice.taxAmount.negated(),
            total: invoice.total.negated(),
            currency: invoice.currency,
            lockedAt: voidedAt,
            correctsInvoiceId: invoice.id,
            lines: {
              create: invoice.lines.map((l) => ({
                description: `Storno: ${l.description}`,
                quantity: l.quantity,
                unitPrice: l.unitPrice.negated(),
                lineTotal: l.lineTotal.negated(),
              })),
            },
          },
          include: { lines: true, client: true, project: true, payments: true, installments: true },
        });
        await this.gobdLedger.append(tx, companyId, actor, "invoice.voided", "Invoice", id, `GoBD correction: voided invoice ${invoice.number} — ${reason}`, {
          number: invoice.number,
          reason,
          correctionInvoiceNumber: number,
        });
        await this.gobdLedger.append(
          tx,
          companyId,
          actor,
          "invoice.correction_issued",
          "Invoice",
          created.id,
          `GoBD correction: issued Stornorechnung ${number} reversing ${invoice.number}`,
          {
            number,
            correctsInvoiceId: invoice.id,
            correctsInvoiceNumber: invoice.number,
            subtotal: created.subtotal.toString(),
            taxAmount: created.taxAmount.toString(),
            total: created.total.toString(),
          },
        );
        return created;
      }),
    );

    this.audit.record(companyId, actor, "invoice.voided", "Invoice", id, `Voided invoice ${invoice.number}: ${reason}`);
    this.audit.record(companyId, actor, "invoice.correction_issued", "Invoice", correction.id, `Issued Stornorechnung ${correction.number} reversing ${invoice.number}`);

    await this.sendInvoicePdfEmail(companyId, correction);

    return correction;
  }

  /** Adds one row to the invoice's planned payment schedule — a plan only, not linked to actual Payment rows. */
  async addInstallment(companyId: string, id: string, input: AddInstallmentInput) {
    const invoice = await this.findOrThrow(companyId, id);
    await this.prisma.invoiceInstallment.create({
      data: {
        invoiceId: id,
        label: input.label,
        amount: input.amount,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        sortOrder: invoice.installments.length,
      },
    });
    return this.findOrThrow(companyId, id);
  }

  /** Records a payment and re-derives invoice status from the running balance. A foreignPayment
   * settles in a currency other than the invoice's own — see fx-settlement.ts. `stripeCheckoutSessionId`
   * is set only by BillingService's webhook handlers and RecurringInvoicesService's autopay (never
   * from user-submitted input — it isn't part of RecordPaymentInput): it holds whichever Stripe
   * object id uniquely identifies the underlying charge — a Checkout session id for a one-off
   * online payment, or a PaymentIntent id for an autopay charge (immediate for a card, or from the
   * async payment_intent.succeeded webhook for a settled SEPA/ACH bank debit) — and makes this
   * idempotent against Stripe redelivering the same event or firing both a synchronous confirm and
   * a later webhook for the one charge: Stripe explicitly does not guarantee exactly-once
   * delivery, and without this a redelivered/duplicate event would credit the same payment twice. */
  async recordPayment(companyId: string, actor: AuditActor, id: string, input: RecordPaymentInput, stripeCheckoutSessionId?: string) {
    const invoice = await this.findOrThrow(companyId, id);
    if (invoice.status === "draft") {
      throw new BadRequestException("Send the invoice before recording a payment against it");
    }
    if (invoice.status === "void") {
      throw new BadRequestException("Cannot record a payment against a void invoice");
    }

    let amount = input.amount ?? 0;
    let fxFields: { currency?: typeof invoice.currency; foreignAmount?: number; exchangeRate?: number; fxGainLoss?: number | null } = {};
    if (input.foreignPayment) {
      const benchmarkRate = await this.exchangeRates.getRate(input.foreignPayment.currency, invoice.currency);
      const settlement = calculateFxSettlement({
        foreignAmount: input.foreignPayment.foreignAmount,
        actualRate: input.foreignPayment.exchangeRate,
        benchmarkRate,
      });
      amount = settlement.convertedAmount;
      fxFields = {
        currency: input.foreignPayment.currency,
        foreignAmount: input.foreignPayment.foreignAmount,
        exchangeRate: input.foreignPayment.exchangeRate,
        fxGainLoss: settlement.gainLoss,
      };
    }

    try {
      await this.prisma.payment.create({
        data: { invoiceId: id, amount, method: input.method, stripeCheckoutSessionId, ...fxFields },
      });
    } catch (err) {
      if (stripeCheckoutSessionId && isDuplicateStripeSession(err)) {
        this.logger.warn(`Stripe checkout session ${stripeCheckoutSessionId} already recorded on invoice ${id} — ignoring redelivered webhook`);
        return this.findOrThrow(companyId, id);
      }
      throw err;
    }

    const payments = await this.prisma.payment.findMany({ where: { invoiceId: id } });
    const paidTotal = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const newStatus = paidTotal >= Number(invoice.total) ? "paid" : "sent";

    // The payment row itself is already committed above (its own try/catch needs to run first to
    // detect a redelivered Stripe webhook) — this transaction covers only the invoice's derived
    // status update, which is what the webhook payload actually describes, so the two commit
    // together.
    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id },
        data: { status: newStatus },
        include: { lines: true, client: true, project: true, payments: true, installments: true },
      });
      await this.outbox.enqueue(tx, companyId, "invoice.payment_recorded", {
        invoiceId: id,
        number: invoice.number,
        amount,
        method: input.method,
        newStatus,
      });
      return updated;
    });

    this.audit.record(
      companyId,
      actor,
      "invoice.payment_recorded",
      "Invoice",
      id,
      `Recorded a ${amount} payment (${input.method}) on invoice ${invoice.number}`,
      { amount, method: input.method },
    );

    return updated;
  }

  /** Shared by generatePdf() and generateZugferdPdf() — the two only differ in which PdfService
   * method renders this same spec (plain vs PDF/A-3b + embedded XML). */
  private buildInvoicePdfSpec(
    invoice: Awaited<ReturnType<typeof this.findOrThrow>>,
    company: Awaited<ReturnType<typeof this.prisma.company.findUniqueOrThrow>>,
    labels: ReturnType<typeof documentPdfLabels>,
    logoBuffer: Buffer | undefined,
  ): PdfDocumentSpec {
    return {
      title: `Invoice ${invoice.number}`,
      subtitle: `${invoice.client.name} — ${invoice.project.name}`,
      meta: [
        { label: labels.status, value: invoice.status },
        { label: labels.currency, value: invoice.currency },
      ],
      tableHeader: [labels.description, labels.qty, labels.unitPrice, labels.lineTotal],
      tableRows: invoice.lines.map((line) => ({
        cells: [line.description, line.quantity.toString(), line.unitPrice.toString(), line.lineTotal.toString()],
      })),
      totals: [
        { label: labels.subtotal, value: `${invoice.subtotal} ${invoice.currency}` },
        { label: labels.tax, value: `${invoice.taxAmount} ${invoice.currency}` },
        { label: labels.totalDue, value: `${invoice.total} ${invoice.currency}`, emphasize: true },
      ],
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
    };
  }

  async generatePdf(companyId: string, id: string): Promise<Buffer> {
    const invoice = await this.findOrThrow(companyId, id);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey) : undefined;
    const labels = documentPdfLabels(invoice.client.preferredLocale ?? company.locale);

    return this.pdfService.render(this.buildInvoicePdfSpec(invoice, company, labels, logoBuffer));
  }

  /**
   * Requires the company's e-invoicing fields (address/city/postalCode/vatId) and the client's
   * billing address to be filled in first — throws a specific, actionable message naming exactly
   * what's missing rather than a generic validation failure. Shared by both e-invoice formats
   * (XRechnung/UBL and ZUGFeRD/CII) since they carry the same EN16931 business data.
   */
  private assertEInvoiceFieldsPresent(
    company: Awaited<ReturnType<typeof this.prisma.company.findUniqueOrThrow>>,
    invoice: Awaited<ReturnType<typeof this.findOrThrow>>,
  ): void {
    const missing: string[] = [];
    if (!company.address) missing.push("company street address");
    if (!company.city) missing.push("company city");
    if (!company.postalCode) missing.push("company postal code");
    if (!company.vatId) missing.push("company VAT ID");
    if (!invoice.client.street) missing.push("client street address");
    if (!invoice.client.city) missing.push("client city");
    if (!invoice.client.postalCode) missing.push("client postal code");
    if (!invoice.client.country) missing.push("client country");
    if (missing.length > 0) {
      throw new BadRequestException(
        `Can't generate an e-invoice — missing: ${missing.join(", ")}. Fill these in under company settings and the client's billing address first.`,
      );
    }
  }

  /** The EN16931 business data both e-invoice XML builders need (buildXRechnungXml's UBL and
   * buildZugferdCiiXml's CII) — same seller/buyer/lines/totals, different XML schema. Call
   * assertEInvoiceFieldsPresent() first; this assumes the required fields are already non-null. */
  private buildEInvoiceInput(
    invoice: Awaited<ReturnType<typeof this.findOrThrow>>,
    company: Awaited<ReturnType<typeof this.prisma.company.findUniqueOrThrow>>,
  ): BuildXRechnungXmlInput {
    return {
      invoiceNumber: invoice.number,
      issueDate: invoice.createdAt,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      seller: {
        name: company.name,
        street: company.address!,
        city: company.city!,
        postalCode: company.postalCode!,
        countryCode: company.country,
        vatId: company.vatId,
        iban: company.iban,
        endpointScheme: company.peppolScheme,
        endpointId: company.peppolParticipantId,
      },
      buyer: {
        name: invoice.client.name,
        street: invoice.client.street!,
        city: invoice.client.city!,
        postalCode: invoice.client.postalCode!,
        countryCode: invoice.client.country!,
        vatId: invoice.client.vatId,
        endpointScheme: invoice.client.peppolScheme,
        endpointId: invoice.client.peppolParticipantId,
      },
      lines: invoice.lines.map((line) => ({
        description: line.description,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        lineTotal: Number(line.lineTotal),
      })),
      subtotal: Number(invoice.subtotal),
      taxAmount: Number(invoice.taxAmount),
      total: Number(invoice.total),
    };
  }

  /** A UBL 2.1/XRechnung 3.0 e-invoice XML for this invoice (see buildXRechnungXml). */
  async generateXRechnungXml(companyId: string, id: string): Promise<{ xml: string; filename: string }> {
    const invoice = await this.findOrThrow(companyId, id);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    this.assertEInvoiceFieldsPresent(company, invoice);

    const xml = buildXRechnungXml(this.buildEInvoiceInput(invoice, company));

    // Content-Disposition header values must be ASCII — an invoice number in another script
    // (e.g. "РАХ-2026-001") would otherwise throw ERR_INVALID_CHAR when the controller sets it.
    const asciiNumber = invoice.number.replace(/[^\x20-\x7e]/g, "_");
    return { xml, filename: `${asciiNumber}-xrechnung.xml` };
  }

  /** Requires the company's own Peppol Participant ID (EndpointID) — see buildPeppolBisXml. Never
   * guesses an EAS scheme, since Peppol covers every EU country's own identifier scheme. */
  private assertPeppolFieldsPresent(company: Awaited<ReturnType<typeof this.prisma.company.findUniqueOrThrow>>): void {
    const missing: string[] = [];
    if (!company.peppolScheme) missing.push("Peppol EAS scheme code");
    if (!company.peppolParticipantId) missing.push("Peppol participant ID");
    if (missing.length > 0) {
      throw new BadRequestException(`Can't generate a Peppol export — missing: ${missing.join(", ")}. Fill these in under company settings first.`);
    }
  }

  /** A Peppol BIS Billing 3.0 e-invoice XML for this invoice (see buildPeppolBisXml). Requires
   * both the shared e-invoicing fields (address/VAT — see assertEInvoiceFieldsPresent) and the
   * company's own Peppol Participant ID. */
  async generatePeppolBisXml(companyId: string, id: string): Promise<{ xml: string; filename: string }> {
    const invoice = await this.findOrThrow(companyId, id);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    this.assertEInvoiceFieldsPresent(company, invoice);
    this.assertPeppolFieldsPresent(company);

    const xml = buildPeppolBisXml(this.buildEInvoiceInput(invoice, company));

    const asciiNumber = invoice.number.replace(/[^\x20-\x7e]/g, "_");
    return { xml, filename: `${asciiNumber}-peppol.xml` };
  }

  /** Generates the Peppol BIS XML and hands it to the Access Point scaffold — see
   * PeppolAccessPointService for why this always throws today (no contracted AP provider exists
   * in this environment) and what's needed to make it actually transmit. */
  async sendPeppolInvoice(companyId: string, id: string): Promise<void> {
    const { xml, filename } = await this.generatePeppolBisXml(companyId, id);
    await this.peppolAccessPoint.sendInvoice(xml, filename);
  }

  /**
   * A ZUGFeRD/Factur-X hybrid invoice: the same visual PDF as generatePdf(), but PDF/A-3b with the
   * EN16931 CII XML (see buildZugferdCiiXml) embedded as "factur-x.xml" — see
   * PdfService.renderZugferdInvoice for the format-mandated attachment/metadata details.
   */
  async generateZugferdPdf(companyId: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.findOrThrow(companyId, id);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    this.assertEInvoiceFieldsPresent(company, invoice);

    const xml = buildZugferdCiiXml(this.buildEInvoiceInput(invoice, company));
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey) : undefined;
    const labels = documentPdfLabels(invoice.client.preferredLocale ?? company.locale);
    const spec = this.buildInvoicePdfSpec(invoice, company, labels, logoBuffer);
    const buffer = await this.pdfService.renderZugferdInvoice(spec, Buffer.from(xml, "utf-8"));

    const asciiNumber = invoice.number.replace(/[^\x20-\x7e]/g, "_");
    return { buffer, filename: `${asciiNumber}-zugferd.pdf` };
  }

  /** Accounting export: one row per invoice, with paid/outstanding derived from its payments. */
  async exportCsv(companyId: string, viewer: ProjectViewer = {}): Promise<string> {
    const visible = await this.projectAccess.visibleWhere(companyId, "Invoice", viewer.userId, viewer.role);
    const invoices = await this.prisma.invoice.findMany({
      where: { AND: [{ companyId }, visible] },
      include: { client: true, project: true, payments: true },
      orderBy: { number: "asc" },
    });

    const header = [
      "Number",
      "Status",
      "Client",
      "Project",
      "Currency",
      "Subtotal",
      "Tax",
      "Total",
      "Paid",
      "Outstanding",
      "Due date",
      "Created date",
    ];
    const rows = invoices.map((inv) => {
      const paid = inv.payments.reduce((sum, p) => sum + Number(p.amount), 0);
      return [
        inv.number,
        inv.status,
        inv.client.name,
        inv.project.name,
        inv.currency,
        inv.subtotal.toString(),
        inv.taxAmount.toString(),
        inv.total.toString(),
        paid.toFixed(2),
        (Number(inv.total) - paid).toFixed(2),
        inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : "",
        inv.createdAt.toISOString().slice(0, 10),
      ];
    });

    return toCsv(header, rows);
  }

  /**
   * QuickBooks Online's bulk-invoice-import CSV format (one row per invoice line, invoice
   * fields repeated per row — QBO groups rows back into one invoice by matching InvoiceNo).
   * "Item" is left as a generic "Services" placeholder — the importing user maps it to a real
   * QBO product/service item during import. Only sent/paid invoices are included; drafts aren't
   * real transactions yet, so they'd have nothing to import.
   */
  async exportQuickBooksCsv(companyId: string): Promise<string> {
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, status: { in: ["sent", "paid"] } },
      include: { client: true, lines: true },
      orderBy: { number: "asc" },
    });

    const header = ["InvoiceNo", "Customer", "InvoiceDate", "DueDate", "Item", "ItemDescription", "ItemQuantity", "ItemRate", "ItemAmount"];
    const rows = invoices.flatMap((inv) =>
      inv.lines.map((line) => [
        inv.number,
        inv.client.name,
        inv.createdAt.toISOString().slice(0, 10),
        (inv.dueDate ?? inv.createdAt).toISOString().slice(0, 10),
        "Services",
        line.description,
        line.quantity.toString(),
        line.unitPrice.toString(),
        line.lineTotal.toString(),
      ]),
    );
    return toCsv(header, rows);
  }

  /**
   * Xero's Sales Invoices import CSV format (one row per invoice line). AccountCode "200" is
   * Xero's default chart-of-accounts code for Sales in a standard chart — the importing user
   * remaps it if their chart differs. TaxType "NONE" leaves tax handling to Xero's own rules
   * rather than guessing a tax rate name that may not exist in the target organisation.
   */
  async exportXeroCsv(companyId: string): Promise<string> {
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, status: { in: ["sent", "paid"] } },
      include: { client: true, lines: true },
      orderBy: { number: "asc" },
    });

    const header = [
      "*ContactName",
      "*InvoiceNumber",
      "*InvoiceDate",
      "*DueDate",
      "*Description",
      "*Quantity",
      "*UnitAmount",
      "*AccountCode",
      "*TaxType",
      "Currency",
    ];
    const rows = invoices.flatMap((inv) =>
      inv.lines.map((line) => [
        inv.client.name,
        inv.number,
        inv.createdAt.toISOString().slice(0, 10),
        (inv.dueDate ?? inv.createdAt).toISOString().slice(0, 10),
        line.description,
        line.quantity.toString(),
        line.unitPrice.toString(),
        "200",
        "NONE",
        inv.currency,
      ]),
    );
    return toCsv(header, rows);
  }

  /**
   * DATEV "Buchungsstapel" export for sales (see datev.ts) — requires the company's DATEV
   * settings to be filled in first, same missing-field pattern as assertEInvoiceFieldsPresent.
   * Invoices whose client has no datevDebitorNumber are skipped (with a warning) rather than
   * failing the whole export — the rest of the batch is still useful.
   */
  private assertDatevSettingsPresent(company: Awaited<ReturnType<typeof this.prisma.company.findUniqueOrThrow>>): void {
    const missing: string[] = [];
    if (!company.datevConsultantNumber) missing.push("DATEV consultant number (Beraternummer)");
    if (!company.datevClientNumber) missing.push("DATEV client number (Mandantennummer)");
    if (!company.datevFiscalYearStartMonth || !company.datevFiscalYearStartDay) missing.push("DATEV fiscal year start");
    if (!company.datevSachkontenlaenge) missing.push("DATEV account number length (Sachkontenlänge)");
    if (!company.datevReceivablesAccount) missing.push("DATEV receivables account");
    if (!company.datevRevenueAccountStandard) missing.push("DATEV standard-rate revenue account");
    if (!company.datevRevenueAccountReduced) missing.push("DATEV reduced-rate revenue account");
    if (!company.datevRevenueAccountExempt) missing.push("DATEV tax-exempt revenue account");
    if (missing.length > 0) {
      throw new BadRequestException(`Can't generate a DATEV export — missing: ${missing.join(", ")}. Fill these in under company settings first.`);
    }
  }

  async exportDatevSalesCsv(companyId: string, from?: Date, to?: Date): Promise<{ csv: string; warnings: string[] }> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    this.assertDatevSettingsPresent(company);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        companyId,
        status: { in: ["sent", "paid"] },
        currency: "EUR",
        ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      include: { client: true },
      orderBy: { number: "asc" },
    });

    const warnings: string[] = [];
    const rows: string[] = [];
    for (const inv of invoices) {
      if (!inv.client.datevDebitorNumber) {
        warnings.push(`Invoice ${inv.number} skipped — client "${inv.client.name}" has no DATEV Debitor number.`);
        continue;
      }
      const subtotal = Number(inv.subtotal);
      const taxPercent = subtotal > 0 ? (Number(inv.taxAmount) / subtotal) * 100 : 0;
      const gegenkonto =
        taxPercent >= 15
          ? company.datevRevenueAccountStandard!
          : taxPercent >= 3
            ? company.datevRevenueAccountReduced!
            : company.datevRevenueAccountExempt!;

      rows.push(
        buildDatevPostingRow({
          amount: Number(inv.total),
          konto: inv.client.datevDebitorNumber,
          gegenkonto,
          belegdatum: inv.createdAt,
          belegfeld1: inv.number,
          buchungstext: inv.client.name,
        }),
      );
    }

    const dates = invoices.map((i) => i.createdAt.getTime());
    const batchFrom = from ?? new Date(dates.length > 0 ? Math.min(...dates) : Date.now());
    const batchTo = to ?? new Date(dates.length > 0 ? Math.max(...dates) : Date.now());

    const header = buildDatevHeader({
      companyName: company.name,
      createdAt: new Date(),
      consultantNumber: company.datevConsultantNumber!,
      clientNumber: company.datevClientNumber!,
      fiscalYearStart: resolveDatevFiscalYearStart(company.datevFiscalYearStartMonth!, company.datevFiscalYearStartDay!, batchFrom),
      sachkontenlaenge: company.datevSachkontenlaenge!,
      batchFrom,
      batchTo,
      label: `Verkauf ${batchFrom.toISOString().slice(0, 10)} - ${batchTo.toISOString().slice(0, 10)}`,
    });

    return { csv: buildDatevBuchungsstapelCsv(header, rows), warnings };
  }

  private async assertInvoiceableEstimate(companyId: string, estimateId: string) {
    const estimate = await this.prisma.estimate.findFirst({ where: { id: estimateId, companyId }, include: { project: true } });
    if (!estimate) throw new NotFoundException("Estimate not found");
    if (!estimate.project) throw new NotFoundException("Estimate has no project — templates can't be invoiced directly");
    if (!estimate.project.clientId) throw new NotFoundException("Project has no client — add a client before invoicing");
    if (estimate.status !== "approved") throw new NotFoundException("Estimate must be approved before it can be invoiced");
    return estimate;
  }

  private async findOrThrow(companyId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, companyId },
      include: {
        lines: true,
        client: true,
        project: true,
        payments: true,
        installments: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    return invoice;
  }
}

function isDuplicateStripeSession(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    ((err.meta?.target as string[] | undefined)?.includes("stripeCheckoutSessionId") ?? false)
  );
}
