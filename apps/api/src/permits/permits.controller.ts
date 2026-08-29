import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createPermitSchema,
  updatePermitSchema,
  type AuthUser,
  type CreatePermitInput,
  type UpdatePermitInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PermitsService } from "./permits.service";

@Controller()
export class PermitsController {
  constructor(private readonly service: PermitsService) {}

  @Get("projects/:id/permits")
  list(@CurrentUser() user: AuthUser, @Param("id") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Post("projects/:id/permits")
  create(
    @CurrentUser() user: AuthUser,
    @Param("id") projectId: string,
    @Body(new ZodValidationPipe(createPermitSchema)) body: CreatePermitInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, projectId, body);
  }

  @Get("permits/:id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Patch("permits/:id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePermitSchema)) body: UpdatePermitInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }

  @Delete("permits/:id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, id);
  }
}
