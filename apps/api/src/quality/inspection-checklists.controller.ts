import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
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

@Controller("inspection-checklists")
export class InspectionChecklistsController {
  constructor(private readonly service: InspectionChecklistsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

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
