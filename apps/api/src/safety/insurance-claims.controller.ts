import { Controller, Get, Header, Body, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createInsuranceClaimSchema,
  updateInsuranceClaimSchema,
  type AuthUser,
  type CreateInsuranceClaimInput,
  type UpdateInsuranceClaimInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { InsuranceClaimsService } from "./insurance-claims.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { RequiresFor } from "../common/decorators/permissions.decorator";

@ProjectResource("InsuranceClaim")
@RequiresFor("finance.view", "finance.manage")
@Controller("insurance-claims")
export class InsuranceClaimsController {
  constructor(private readonly service: InsuranceClaimsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId?: string) {
    return this.service.list(user.companyId, projectId);
  }

  // Declared before ":id" so "export" isn't swallowed as a claim id.
  @Get("export")
  @Header("Content-Type", "text/csv")
  export(@CurrentUser() user: AuthUser) {
    return this.service.exportCsv(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createInsuranceClaimSchema)) body: CreateInsuranceClaimInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateInsuranceClaimSchema)) body: UpdateInsuranceClaimInput,
  ) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
