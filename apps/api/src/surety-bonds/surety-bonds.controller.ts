import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createSuretyBondSchema,
  updateSuretyBondCapacityLimitSchema,
  type AuthUser,
  type CreateSuretyBondInput,
  type UpdateSuretyBondCapacityLimitInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SuretyBondsService } from "./surety-bonds.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { RequiresFor } from "../common/decorators/permissions.decorator";

@ProjectResource("SuretyBond")
@RequiresFor("finance.view", "finance.manage")
@Controller("surety-bonds")
export class SuretyBondsController {
  constructor(private readonly service: SuretyBondsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId?: string) {
    return this.service.list(user.companyId, projectId);
  }

  @Get("capacity")
  capacityUtilization(@CurrentUser() user: AuthUser) {
    return this.service.capacityUtilization(user.companyId);
  }

  @Patch("capacity")
  updateCapacityLimit(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateSuretyBondCapacityLimitSchema)) body: UpdateSuretyBondCapacityLimitInput,
  ) {
    return this.service.updateCapacityLimit(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createSuretyBondSchema)) body: CreateSuretyBondInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Post(":id/release")
  release(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.release(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
