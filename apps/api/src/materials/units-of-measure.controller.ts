import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createUnitOfMeasureSchema,
  updateUnitOfMeasureSchema,
  type AuthUser,
  type CreateUnitOfMeasureInput,
  type UpdateUnitOfMeasureInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { UnitsOfMeasureService } from "./units-of-measure.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";

@NotProjectScoped("company units of measure")
@Controller("materials/units-of-measure")
export class UnitsOfMeasureController {
  constructor(private readonly service: UnitsOfMeasureService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createUnitOfMeasureSchema)) body: CreateUnitOfMeasureInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateUnitOfMeasureSchema)) body: UpdateUnitOfMeasureInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, id);
  }
}
