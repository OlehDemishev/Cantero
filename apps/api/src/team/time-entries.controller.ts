import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { createTimeEntrySchema, type AuthUser, type CreateTimeEntryInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { TimeEntriesService } from "./time-entries.service";

@Controller("time-entries")
export class TimeEntriesController {
  constructor(private readonly service: TimeEntriesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createTimeEntrySchema)) body: CreateTimeEntryInput,
  ) {
    return this.service.create(user.companyId, body);
  }
}
