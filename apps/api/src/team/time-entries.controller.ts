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
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { CREW, SelfScopeService } from "../common/permissions/self-scope.service";
import { DateQueryPipe } from "../common/pipes/query-pipes";

const TIME_ENTRIES_PAGE_SIZE = 100;

@ProjectResource("TimeEntry")
@OpenToAllRoles("every member logs their own hours; seeing or changing the crew's needs site.crewTime")
@Controller("time-entries")
export class TimeEntriesController {
  constructor(
    private readonly service: TimeEntriesService,
    private readonly selfScope: SelfScopeService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query("projectId") projectId?: string,
    @Query("workerId") workerId?: string,
    @Query("from", DateQueryPipe) from?: string,
    @Query("to", DateQueryPipe) to?: string,
    @Query("cursor") cursor?: string,
  ) {
    const workerIds = await this.selfScope.listScope(user, workerId, CREW.time);
    return this.service.list(user.companyId, { projectId, workerId, workerIds, from, to }, { take: TIME_ENTRIES_PAGE_SIZE, cursor }, user);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createTimeEntrySchema)) body: CreateTimeEntryInput,
  ) {
    await this.selfScope.assertOwnWorker(user, body.workerId, CREW.time);
    return this.service.create(user.companyId, body);
  }

  @Patch(":id")
  async update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTimeEntrySchema)) body: UpdateTimeEntryInput,
  ) {
    await this.selfScope.assertOwnRecord(user, "timeEntry", id, CREW.time);
    return this.service.update(user.companyId, id, body);
  }

  @Delete(":id")
  async delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.selfScope.assertOwnRecord(user, "timeEntry", id, CREW.time);
    return this.service.delete(user.companyId, id);
  }
}
