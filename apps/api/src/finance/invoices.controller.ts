import { Body, Controller, Get, Header, Param, Post, StreamableFile } from "@nestjs/common";
import { IsUUID } from "class-validator";
import { recordPaymentSchema, type AuthUser, type RecordPaymentInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { InvoicesService } from "./invoices.service";

class GenerateFromEstimateDto {
  @IsUUID()
  estimateId!: string;
}

@Controller("invoices")
export class InvoicesController {
  constructor(private readonly service: InvoicesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post("from-estimate")
  generateFromEstimate(@CurrentUser() user: AuthUser, @Body() body: GenerateFromEstimateDto) {
    return this.service.generateFromEstimate(user.companyId, body.estimateId);
  }

  @Post(":id/send")
  send(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.send(user.companyId, id);
  }

  @Post(":id/payments")
  recordPayment(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(recordPaymentSchema)) body: RecordPaymentInput,
  ) {
    return this.service.recordPayment(user.companyId, id, body);
  }

  @Get(":id/pdf")
  @Header("Content-Type", "application/pdf")
  async pdf(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.service.generatePdf(user.companyId, id);
    return new StreamableFile(buffer);
  }
}
