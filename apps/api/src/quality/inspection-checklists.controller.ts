import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import {
  createDeficiencyFromItemSchema,
  createInspectionChecklistSchema,
  recordInspectionItemResultSchema,
  type AuthUser,
  type CreateDeficiencyFromItemInput,
  type CreateInspectionChecklistInput,
  type RecordInspectionItemResultInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { InspectionChecklistsService } from "./inspection-checklists.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@ProjectResource("InspectionChecklist")
@Requires("site.manage")
@Controller("inspection-checklists")
export class InspectionChecklistsController {
  constructor(private readonly service: InspectionChecklistsService) {}

  @OpenToAllRoles("every member reads these to do their own site work")
  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @OpenToAllRoles("every member reads these to do their own site work")
  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createInspectionChecklistSchema)) body: CreateInspectionChecklistInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @OpenToAllRoles("site work every member does on a project")
  @Post(":id/items/:itemId/result")
  recordItemResult(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(recordInspectionItemResultSchema)) body: RecordInspectionItemResultInput,
  ) {
    return this.service.recordItemResult(user.companyId, id, itemId, body);
  }

  @Post(":id/items/:itemId/deficiency")
  createDeficiencyFromItem(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(createDeficiencyFromItemSchema)) body: CreateDeficiencyFromItemInput,
  ) {
    return this.service.createDeficiencyFromItem(user.companyId, { userId: user.userId, name: user.name }, id, itemId, body);
  }

  @Post(":id/complete")
  complete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.complete(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
