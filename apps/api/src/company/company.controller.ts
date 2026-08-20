import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { updateCompanySchema, type AuthUser, type UpdateCompanyInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CompanyService } from "./company.service";

@Controller("company")
export class CompanyController {
  constructor(private readonly service: CompanyService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.service.get(user.companyId);
  }

  @Roles("owner", "admin")
  @Patch()
  update(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(updateCompanySchema)) body: UpdateCompanyInput) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Roles("owner", "admin")
  @Post("complete-onboarding")
  completeOnboarding(@CurrentUser() user: AuthUser) {
    return this.service.completeOnboarding(user.companyId, { userId: user.userId, name: user.name });
  }
}
