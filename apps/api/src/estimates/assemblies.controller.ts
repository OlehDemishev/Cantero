import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createAssemblySchema,
  updateAssemblySchema,
  type AuthUser,
  type CreateAssemblyInput,
  type UpdateAssemblyInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AssembliesService } from "./assemblies.service";

@Controller("assemblies")
export class AssembliesController {
  constructor(private readonly service: AssembliesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createAssemblySchema)) body: CreateAssemblyInput) {
    return this.service.create(user.companyId, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateAssemblySchema)) body: UpdateAssemblyInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, id);
  }
}
