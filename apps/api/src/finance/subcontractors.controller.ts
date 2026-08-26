import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  addSubcontractorDocumentSchema,
  assignSubcontractorSchema,
  createSubcontractorSchema,
  setSubcontractorPublicListedSchema,
  updateSubcontractorProfileSchema,
  type AddSubcontractorDocumentInput,
  type AssignSubcontractorInput,
  type AuthUser,
  type CreateSubcontractorInput,
  type SetSubcontractorPublicListedInput,
  type UpdateSubcontractorProfileInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SubcontractorsService } from "./subcontractors.service";

@Controller("finance/subcontractors")
export class SubcontractorsController {
  constructor(private readonly service: SubcontractorsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSubcontractorSchema)) body: CreateSubcontractorInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Get(":id/assignments")
  listAssignments(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listAssignments(user.companyId, id);
  }

  @Post(":id/assignments")
  assign(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assignSubcontractorSchema)) body: AssignSubcontractorInput,
  ) {
    return this.service.assign(user.companyId, id, body.projectId);
  }

  @Delete(":id/assignments/:assignmentId")
  unassign(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("assignmentId") assignmentId: string) {
    return this.service.unassign(user.companyId, id, assignmentId);
  }

  @Get(":id/documents")
  listDocuments(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listDocuments(user.companyId, id);
  }

  @Post(":id/documents")
  addDocument(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addSubcontractorDocumentSchema)) body: AddSubcontractorDocumentInput,
  ) {
    return this.service.addDocument(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Delete(":id/documents/:documentId")
  removeDocument(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("documentId") documentId: string) {
    return this.service.deleteDocument(user.companyId, id, documentId);
  }

  @Get(":id/compliance")
  complianceStatus(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.complianceStatus(user.companyId, id);
  }

  @Patch(":id/profile")
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSubcontractorProfileSchema)) body: UpdateSubcontractorProfileInput,
  ) {
    return this.service.updateProfile(user.companyId, id, body);
  }

  @Patch(":id/public-listed")
  setPublicListed(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setSubcontractorPublicListedSchema)) body: SetSubcontractorPublicListedInput,
  ) {
    return this.service.setPublicListed(user.companyId, id, body.publicListed);
  }
}
