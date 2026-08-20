import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createSafetyBriefingSchema,
  updateSafetyBriefingSchema,
  type AuthUser,
  type CreateSafetyBriefingInput,
  type UpdateSafetyBriefingInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SafetyBriefingsService } from "./safety-briefings.service";

@Controller("safety/briefings")
export class SafetyBriefingsController {
  constructor(private readonly service: SafetyBriefingsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createSafetyBriefingSchema)) body: CreateSafetyBriefingInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSafetyBriefingSchema)) body: UpdateSafetyBriefingInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }
}
