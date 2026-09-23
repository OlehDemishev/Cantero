import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  addContractClaimEventSchema,
  createContractClaimSchema,
  resolveContractClaimSchema,
  updateContractClaimStatusSchema,
  type AddContractClaimEventInput,
  type AuthUser,
  type CreateContractClaimInput,
  type ResolveContractClaimInput,
  type UpdateContractClaimStatusInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ContractClaimsService } from "./contract-claims.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { RequiresFor } from "../common/decorators/permissions.decorator";

@ProjectResource("ContractClaim")
@RequiresFor("contracts.view", "contracts.manage")
@Controller()
export class ContractClaimsController {
  constructor(private readonly service: ContractClaimsService) {}

  @Get("projects/:id/contract-claims")
  listForProject(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listForProject(user.companyId, id);
  }

  @Post("projects/:id/contract-claims")
  create(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createContractClaimSchema)) body: CreateContractClaimInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get("contract-claims/:id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post("contract-claims/:id/status")
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateContractClaimStatusSchema)) body: UpdateContractClaimStatusInput,
  ) {
    return this.service.updateStatus(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post("contract-claims/:id/resolve")
  resolve(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(resolveContractClaimSchema)) body: ResolveContractClaimInput,
  ) {
    return this.service.resolve(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post("contract-claims/:id/events")
  addEvent(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addContractClaimEventSchema)) body: AddContractClaimEventInput,
  ) {
    return this.service.addEvent(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
