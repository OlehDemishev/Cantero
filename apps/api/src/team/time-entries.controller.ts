import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createTimeEntrySchema,
  updateTimeEntrySchema,
  type AuthUser,
  type CreateTimeEntryInput,
  type UpdateTimeEntryInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { TimeEntriesService } from "./time-entries.service";

const TIME_ENTRIES_PAGE_SIZE = 100;

@Controller("time-entries")
export class TimeEntriesController {
  constructor(private readonly service: TimeEntriesService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("projectId") projectId?: string,
    @Query("workerId") workerId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.service.list(user.companyId, { projectId, workerId, from, to }, { take: TIME_ENTRIES_PAGE_SIZE, cursor });
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createTimeEntrySchema)) body: CreateTimeEntryInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTimeEntrySchema)) body: UpdateTimeEntryInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, id);
  }
}
