import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import {
  assignSubcontractorSchema,
  createSubcontractorSchema,
  type AssignSubcontractorInput,
  type AuthUser,
  type CreateSubcontractorInput,
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
}
