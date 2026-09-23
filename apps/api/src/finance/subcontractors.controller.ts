import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  addSubcontractorDocumentSchema,
  addSubcontractorPaymentSchema,
  assignSubcontractorSchema,
  createPerformanceReviewSchema,
  createSubcontractorSchema,
  setAssignmentActualEndDateSchema,
  setSubcontractorDiversityCertificationsSchema,
  setSubcontractorPublicListedSchema,
  updateSubcontractorProfileSchema,
  updateSubcontractorTaxProfileSchema,
  type AddSubcontractorDocumentInput,
  type AddSubcontractorPaymentInput,
  type AssignSubcontractorInput,
  type AuthUser,
  type CreatePerformanceReviewInput,
  type CreateSubcontractorInput,
  type SetAssignmentActualEndDateInput,
  type SetSubcontractorDiversityCertificationsInput,
  type SetSubcontractorPublicListedInput,
  type UpdateSubcontractorProfileInput,
  type UpdateSubcontractorTaxProfileInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SubcontractorsService } from "./subcontractors.service";
import { NotProjectScoped, ProjectResource } from "../common/project-access/project-resource.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@NotProjectScoped("`:id` is a subcontractor company, not a project record")
@ProjectResource("SubcontractorAssignment", "assignmentId")
@Requires("subcontractors.manage")
@Controller("finance/subcontractors")
export class SubcontractorsController {
  constructor(private readonly service: SubcontractorsService) {}

  @Requires("subcontractors.view")
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Requires("finance.view")
  @Get("tax-summary")
  taxSummary(@CurrentUser() user: AuthUser, @Query("year") year: string) {
    return this.service.taxSummary(user.companyId, Number(year));
  }

  @Requires("finance.view")
  @Get("diversity-spend-report")
  diversitySpendReport(@CurrentUser() user: AuthUser, @Query("projectId") projectId?: string) {
    return this.service.diversitySpendReport(user.companyId, projectId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSubcontractorSchema)) body: CreateSubcontractorInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Requires("subcontractors.view")
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
    return this.service.assign(user.companyId, id, body.projectId, body.startDate, body.endDate);
  }

  @Delete(":id/assignments/:assignmentId")
  unassign(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("assignmentId") assignmentId: string) {
    return this.service.unassign(user.companyId, id, assignmentId);
  }

  @Requires("subcontractors.view")
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

  @Requires("subcontractors.view")
  @Get(":id/compliance")
  complianceStatus(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.complianceStatus(user.companyId, id);
  }

  @Patch(":id/assignments/:assignmentId/actual-end-date")
  setActualEndDate(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("assignmentId") assignmentId: string,
    @Body(new ZodValidationPipe(setAssignmentActualEndDateSchema)) body: SetAssignmentActualEndDateInput,
  ) {
    return this.service.setActualEndDate(user.companyId, id, assignmentId, body.actualEndDate);
  }

  @Requires("subcontractors.view")
  @Get(":id/performance-reviews")
  listPerformanceReviews(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listPerformanceReviews(user.companyId, id);
  }

  @Post(":id/performance-reviews")
  addPerformanceReview(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createPerformanceReviewSchema)) body: CreatePerformanceReviewInput,
  ) {
    return this.service.addPerformanceReview(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Requires("subcontractors.view")
  @Get(":id/scorecard")
  performanceScorecard(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.performanceScorecard(user.companyId, id);
  }

  @Patch(":id/profile")
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSubcontractorProfileSchema)) body: UpdateSubcontractorProfileInput,
  ) {
    return this.service.updateProfile(user.companyId, id, body);
  }

  @Requires("finance.taxProfiles")
  @Get(":id/tax-profile")
  getTaxProfile(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.getTaxProfile(user.companyId, id);
  }

  @Requires("finance.taxProfiles")
  @Patch(":id/tax-profile")
  updateTaxProfile(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSubcontractorTaxProfileSchema)) body: UpdateSubcontractorTaxProfileInput,
  ) {
    return this.service.updateTaxProfile(user.companyId, id, body);
  }

  @Requires("finance.view")
  @Get(":id/payments")
  listPayments(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listPayments(user.companyId, id);
  }

  @Requires("finance.manage")
  @Post(":id/payments")
  addPayment(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addSubcontractorPaymentSchema)) body: AddSubcontractorPaymentInput,
  ) {
    return this.service.addPayment(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Patch(":id/public-listed")
  setPublicListed(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setSubcontractorPublicListedSchema)) body: SetSubcontractorPublicListedInput,
  ) {
    return this.service.setPublicListed(user.companyId, id, body.publicListed);
  }

  @Patch(":id/diversity-certifications")
  setDiversityCertifications(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setSubcontractorDiversityCertificationsSchema)) body: SetSubcontractorDiversityCertificationsInput,
  ) {
    return this.service.setDiversityCertifications(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
