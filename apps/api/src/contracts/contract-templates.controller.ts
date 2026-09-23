import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createContractTemplateSchema,
  updateContractTemplateSchema,
  type AuthUser,
  type CreateContractTemplateInput,
  type UpdateContractTemplateInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ContractTemplatesService } from "./contract-templates.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@NotProjectScoped("company-wide contract templates")
@Requires("templates.company")
@Controller("contract-templates")
export class ContractTemplatesController {
  constructor(private readonly service: ContractTemplatesService) {}

  @OpenToAllRoles("every role may need the company's templates and certificates on hand")
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @OpenToAllRoles("every role may need the company's templates and certificates on hand")
  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createContractTemplateSchema)) body: CreateContractTemplateInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateContractTemplateSchema)) body: UpdateContractTemplateInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, id);
  }
}
