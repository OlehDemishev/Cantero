import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { createAnnotationSchema, type AuthUser, type CreateAnnotationInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AnnotationsService } from "./annotations.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";

@ProjectResource("DrawingSheet", "sheetId")
@ProjectResource("Annotation")
@Controller("drawing-sheets/:sheetId/annotations")
export class AnnotationsController {
  constructor(private readonly service: AnnotationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param("sheetId") sheetId: string) {
    return this.service.list(user.companyId, sheetId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param("sheetId") sheetId: string,
    @Body(new ZodValidationPipe(createAnnotationSchema)) body: CreateAnnotationInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, sheetId, body);
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, id);
  }
}
