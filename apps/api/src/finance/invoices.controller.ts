import { Body, Controller, Get, Header, Param, Patch, Post, Res, StreamableFile } from "@nestjs/common";
import { IsUUID } from "class-validator";
import type { Response } from "express";
import {
  addInstallmentSchema,
  generateProgressInvoiceSchema,
  recordPaymentSchema,
  updateInvoiceSchema,
  type AddInstallmentInput,
  type AuthUser,
  type GenerateProgressInvoiceInput,
  type RecordPaymentInput,
  type UpdateInvoiceInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { InvoicesService } from "./invoices.service";
import { AiaBillingService } from "./aia-billing.service";

class GenerateFromEstimateDto {
  @IsUUID()
  estimateId!: string;
}

@Controller("invoices")
export class InvoicesController {
  constructor(
    private readonly service: InvoicesService,
    private readonly aiaBilling: AiaBillingService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  // Declared before ":id" so "export.csv" isn't swallowed as an invoice id.
  @Get("export.csv")
  @Header("Content-Type", "text/csv")
  async exportCsv(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    res.set("Content-Disposition", 'attachment; filename="invoices.csv"');
    return this.service.exportCsv(user.companyId);
  }

  @Get("export/quickbooks.csv")
  @Header("Content-Type", "text/csv")
  async exportQuickBooksCsv(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    res.set("Content-Disposition", 'attachment; filename="invoices-quickbooks.csv"');
    return this.service.exportQuickBooksCsv(user.companyId);
  }

  @Get("export/xero.csv")
  @Header("Content-Type", "text/csv")
  async exportXeroCsv(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    res.set("Content-Disposition", 'attachment; filename="invoices-xero.csv"');
    return this.service.exportXeroCsv(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post("from-estimate")
  generateFromEstimate(@CurrentUser() user: AuthUser, @Body() body: GenerateFromEstimateDto) {
    return this.service.generateFromEstimate(user.companyId, body.estimateId);
  }

  @Get("progress-billing/:estimateId")
  progressBillingSummary(@CurrentUser() user: AuthUser, @Param("estimateId") estimateId: string) {
    return this.service.progressBillingSummary(user.companyId, estimateId);
  }

  @Post("progress-billing")
  generateProgressInvoice(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(generateProgressInvoiceSchema)) body: GenerateProgressInvoiceInput,
  ) {
    return this.service.generateProgressInvoice(user.companyId, body.estimateId, body);
  }

  @Post("progress-billing/:estimateId/release-retainage")
  releaseRetainage(@CurrentUser() user: AuthUser, @Param("estimateId") estimateId: string) {
    return this.service.releaseRetainage(user.companyId, estimateId);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateInvoiceSchema)) body: UpdateInvoiceInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }

  @Roles("owner", "admin", "accountant")
  @Post(":id/send")
  send(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.send(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Roles("owner", "admin", "accountant")
  @Post(":id/installments")
  addInstallment(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addInstallmentSchema)) body: AddInstallmentInput,
  ) {
    return this.service.addInstallment(user.companyId, id, body);
  }

  @Roles("owner", "admin", "accountant")
  @Post(":id/payments")
  recordPayment(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(recordPaymentSchema)) body: RecordPaymentInput,
  ) {
    return this.service.recordPayment(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get(":id/pdf")
  @Header("Content-Type", "application/pdf")
  async pdf(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.service.generatePdf(user.companyId, id);
    return new StreamableFile(buffer);
  }

  @Get(":id/schedule-of-values-pdf")
  @Header("Content-Type", "application/pdf")
  async scheduleOfValuesPdf(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.aiaBilling.generatePdf(user.companyId, id);
    return new StreamableFile(buffer, { disposition: `attachment; filename="schedule-of-values.pdf"` });
  }
}
