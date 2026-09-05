import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createVendorBillSchema, schedulePaymentSchema, type AuthUser, type CreateVendorBillInput, type SchedulePaymentInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { VendorBillsService } from "./vendor-bills.service";

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
}
