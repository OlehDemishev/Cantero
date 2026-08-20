import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  bulkActionIdsSchema,
  createWarrantyClaimSchema,
  denyWarrantyClaimSchema,
  resolveWarrantyClaimSchema,
  updateWarrantyClaimSchema,
  type AuthUser,
  type BulkActionIdsInput,
  type CreateWarrantyClaimInput,
  type DenyWarrantyClaimInput,
  type ResolveWarrantyClaimInput,
  type UpdateWarrantyClaimInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { WarrantyClaimsService } from "./warranty-claims.service";

@Controller("warranty-claims")
export class WarrantyClaimsController {
  constructor(private readonly service: WarrantyClaimsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createWarrantyClaimSchema)) body: CreateWarrantyClaimInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateWarrantyClaimSchema)) body: UpdateWarrantyClaimInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }

  @Post("bulk/start")
  bulkStart(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(bulkActionIdsSchema)) body: BulkActionIdsInput) {
    return this.service.bulkStart(user.companyId, { userId: user.userId, name: user.name }, body.ids);
  }

  @Post(":id/start")
  start(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.start(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/resolve")
  resolve(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(resolveWarrantyClaimSchema)) body: ResolveWarrantyClaimInput,
  ) {
    return this.service.resolve(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/deny")
  deny(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(denyWarrantyClaimSchema)) body: DenyWarrantyClaimInput,
  ) {
    return this.service.deny(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/reopen")
  reopen(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.reopen(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
