import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createVendorBillSchema, type AuthUser, type CreateVendorBillInput } from "@cantero/shared";
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

  @Post(":id/pay")
  markPaid(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.markPaid(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
