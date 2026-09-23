import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { createCostCodeSchema, updateCostCodeSchema, type AuthUser, type CreateCostCodeInput, type UpdateCostCodeInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CostCodesService } from "./cost-codes.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@NotProjectScoped("company cost-code list")
@Requires("pricing.manage")
@Controller("cost-codes")
export class CostCodesController {
  constructor(private readonly service: CostCodesService) {}

  @OpenToAllRoles("reference data every role estimates or works from")
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createCostCodeSchema)) body: CreateCostCodeInput) {
    return this.service.create(user.companyId, body);
  }

  @Post("import-standard-library")
  importStandardLibrary(@CurrentUser() user: AuthUser) {
    return this.service.importStandardLibrary(user.companyId, { userId: user.userId, name: user.name });
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCostCodeSchema)) body: UpdateCostCodeInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, id);
  }
}
