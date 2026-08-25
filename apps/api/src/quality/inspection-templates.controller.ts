import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createInspectionTemplateSchema,
  updateInspectionTemplateSchema,
  type AuthUser,
  type CreateInspectionTemplateInput,
  type UpdateInspectionTemplateInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { InspectionTemplatesService } from "./inspection-templates.service";

@Controller("inspection-templates")
export class InspectionTemplatesController {
  constructor(private readonly service: InspectionTemplatesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createInspectionTemplateSchema)) body: CreateInspectionTemplateInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateInspectionTemplateSchema)) body: UpdateInspectionTemplateInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, id);
  }
}
