import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  addAllowanceChargeSchema,
  createAllowanceSchema,
  type AddAllowanceChargeInput,
  type AuthUser,
  type CreateAllowanceInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AllowancesService } from "./allowances.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { Requires, RequiresFor } from "../common/decorators/permissions.decorator";

@ProjectResource("Allowance")
@RequiresFor("finance.view", "finance.manage")
@Controller()
export class AllowancesController {
  constructor(private readonly service: AllowancesService) {}

  @Requires("costing.view")
  @Get("projects/:id/allowances")
  list(@CurrentUser() user: AuthUser, @Param("id") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Post("projects/:id/allowances")
  create(
    @CurrentUser() user: AuthUser,
    @Param("id") projectId: string,
    @Body(new ZodValidationPipe(createAllowanceSchema)) body: CreateAllowanceInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, projectId, body);
  }

  @Post("allowances/:id/charges")
  addCharge(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addAllowanceChargeSchema)) body: AddAllowanceChargeInput,
  ) {
    return this.service.addCharge(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post("allowances/:id/close")
  close(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.close(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
