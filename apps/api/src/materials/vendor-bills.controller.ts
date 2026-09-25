import { Body, Controller, Get, Header, Param, Post, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import {
  createVendorBillSchema,
  schedulePaymentSchema,
  voidVendorBillSchema,
  type AuthUser,
  type CreateVendorBillInput,
  type SchedulePaymentInput,
  type VoidVendorBillInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { VendorBillsService } from "./vendor-bills.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { Requires, RequiresFor } from "../common/decorators/permissions.decorator";
import { DateQueryPipe } from "../common/pipes/query-pipes";

@NotProjectScoped("vendor bills have no project link in the schema")
@RequiresFor("finance.view", "finance.manage")
@Controller("materials/vendor-bills")
export class VendorBillsController {
  constructor(private readonly service: VendorBillsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get("aging-report")
  agingReport(@CurrentUser() user: AuthUser) {
    return this.service.agingReport(user.companyId);
  }

  @Requires("finance.export")
  @Requires("finance.export")
  @Get("export/sage-300-cre.txt")
  @Header("Content-Type", "application/octet-stream")
  async exportSage300Cre(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Query("from", DateQueryPipe) from?: string,
    @Query("to", DateQueryPipe) to?: string,
    @Query("expenseAccount") expenseAccount?: string,
    @Query("apAccount") apAccount?: string,
  ) {
    res.set("Content-Disposition", 'attachment; filename="ap-invoices-sage-300-cre.txt"');
    return this.service.exportSage300Cre(user.companyId, { userId: user.userId, name: user.name }, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      expenseAccount: expenseAccount || undefined,
      apAccount: apAccount || undefined,
    });
  }

  @Get("disbursement-calendar")
  disbursementCalendar(@CurrentUser() user: AuthUser) {
    return this.service.disbursementCalendar(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createVendorBillSchema)) body: CreateVendorBillInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Post(":id/approve")
  approve(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.approve(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/schedule-payment")
  schedulePayment(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(schedulePaymentSchema)) body: SchedulePaymentInput,
  ) {
    return this.service.schedulePayment(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/pay")
  markPaid(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.markPaid(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/void")
  void(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(voidVendorBillSchema)) body: VoidVendorBillInput,
  ) {
    return this.service.void(user.companyId, { userId: user.userId, name: user.name }, id, body.reason);
  }
}
