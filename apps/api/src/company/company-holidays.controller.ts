import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { createCompanyHolidaySchema, type AuthUser, type CreateCompanyHolidayInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { OpenToAllRoles, Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CompanyHolidaysService } from "./company-holidays.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";

@NotProjectScoped("company holiday calendar")
@OpenToAllRoles("company directory and calendars every member reads; changes carry their own @Roles")
@Controller("company/holidays")
export class CompanyHolidaysController {
  constructor(private readonly service: CompanyHolidaysService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Roles("owner", "admin")
  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createCompanyHolidaySchema)) body: CreateCompanyHolidayInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Roles("owner", "admin")
  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
