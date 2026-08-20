import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createRecurringInvoiceSchema,
  updateRecurringInvoiceSchema,
  type AuthUser,
  type CreateRecurringInvoiceInput,
  type UpdateRecurringInvoiceInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { RecurringInvoicesService } from "./recurring-invoices.service";

@Roles("owner", "admin", "accountant")
@Controller("recurring-invoices")
export class RecurringInvoicesController {
  constructor(private readonly service: RecurringInvoicesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createRecurringInvoiceSchema)) body: CreateRecurringInvoiceInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateRecurringInvoiceSchema)) body: UpdateRecurringInvoiceInput,
  ) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/pause")
  pause(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.setActive(user.companyId, { userId: user.userId, name: user.name }, id, false);
  }

  @Post(":id/resume")
  resume(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.setActive(user.companyId, { userId: user.userId, name: user.name }, id, true);
  }

  @Post(":id/generate-now")
  generateNow(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.generateNow(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
