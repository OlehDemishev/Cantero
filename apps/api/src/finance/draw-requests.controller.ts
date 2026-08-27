import { Body, Controller, Get, Header, Param, Patch, Post, Query, StreamableFile } from "@nestjs/common";
import {
  createDrawRequestSchema,
  updateDrawRequestStatusSchema,
  type AuthUser,
  type CreateDrawRequestInput,
  type UpdateDrawRequestStatusInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { DrawRequestsService } from "./draw-requests.service";

@Controller("draw-requests")
export class DrawRequestsController {
  constructor(private readonly service: DrawRequestsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId?: string) {
    return this.service.list(user.companyId, projectId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createDrawRequestSchema)) body: CreateDrawRequestInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id/status")
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateDrawRequestStatusSchema)) body: UpdateDrawRequestStatusInput,
  ) {
    return this.service.updateStatus(user.companyId, { userId: user.userId, name: user.name }, id, body.status);
  }

  @Get(":id/package")
  @Header("Content-Type", "application/zip")
  async downloadPackage(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.service.buildPackage(user.companyId, id);
    return new StreamableFile(buffer, { disposition: `attachment; filename="draw-request-package.zip"` });
  }
}
