import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createFringeBenefitFundSchema,
  createWageClassificationSchema,
  updateWageClassificationSchema,
  type AuthUser,
  type CreateFringeBenefitFundInput,
  type CreateWageClassificationInput,
  type UpdateWageClassificationInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { WageClassificationsService } from "./wage-classifications.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";

@NotProjectScoped("wage classifications are a company-wide rate table")
@Controller("wage-classifications")
export class WageClassificationsController {
  constructor(private readonly service: WageClassificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createWageClassificationSchema)) body: CreateWageClassificationInput) {
    return this.service.create(user.companyId, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateWageClassificationSchema)) body: UpdateWageClassificationInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, id);
  }

  @Post(":id/fringe-funds")
  addFringeFund(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createFringeBenefitFundSchema)) body: CreateFringeBenefitFundInput,
  ) {
    return this.service.addFringeFund(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Delete("fringe-funds/:id")
  deleteFringeFund(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.deleteFringeFund(user.companyId, id);
  }
}
