import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  addCompanyDocumentSchema,
  setCoiPubliclySharedSchema,
  type AddCompanyDocumentInput,
  type AuthUser,
  type SetCoiPubliclySharedInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CompanyCoiService } from "./company-coi.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@NotProjectScoped("the company's own insurance certificates")
@Requires("templates.company")
@Controller("company/coi-documents")
export class CompanyCoiController {
  constructor(private readonly service: CompanyCoiService) {}

  @OpenToAllRoles("every role may need the company's templates and certificates on hand")
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.listDocuments(user.companyId);
  }

  @Post()
  add(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(addCompanyDocumentSchema)) body: AddCompanyDocumentInput) {
    return this.service.addDocument(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.deleteDocument(user.companyId, id);
  }

  @Patch("public-share")
  setPubliclyShared(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(setCoiPubliclySharedSchema)) body: SetCoiPubliclySharedInput,
  ) {
    return this.service.setCoiPubliclyShared(user.companyId, body.coiPubliclyShared);
  }
}
