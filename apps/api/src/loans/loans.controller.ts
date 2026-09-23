import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { createLoanSchema, recordLoanPaymentSchema, type AuthUser, type CreateLoanInput, type RecordLoanPaymentInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { LoansService } from "./loans.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@NotProjectScoped("company loans")
@Requires("hr.payroll")
@Controller("loans")
export class LoansController {
  constructor(private readonly service: LoansService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get("debt-service-summary")
  debtServiceSummary(@CurrentUser() user: AuthUser, @Query("monthsAhead") monthsAhead?: string) {
    return this.service.debtServiceSummary(user.companyId, monthsAhead ? Number(monthsAhead) : undefined);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createLoanSchema)) body: CreateLoanInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Post("payments/:paymentId/record")
  recordPayment(
    @CurrentUser() user: AuthUser,
    @Param("paymentId") paymentId: string,
    @Body(new ZodValidationPipe(recordLoanPaymentSchema)) body: RecordLoanPaymentInput,
  ) {
    return this.service.recordPayment(user.companyId, { userId: user.userId, name: user.name }, paymentId, body);
  }
}
