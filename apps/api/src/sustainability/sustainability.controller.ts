import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from "@nestjs/common";
import { createGreenCertificationSchema, type AuthUser, type CreateGreenCertificationInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SustainabilityService } from "./sustainability.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";

@Controller("sustainability")
export class SustainabilityController {
  constructor(private readonly service: SustainabilityService) {}

  @Get("certifications")
  listCertifications(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.listCertifications(user.companyId, projectId);
  }

  @Post("certifications")
  addCertification(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createGreenCertificationSchema)) body: CreateGreenCertificationInput,
  ) {
    return this.service.addCertification(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @ProjectResource("ProjectGreenCertification")
  @Delete("certifications/:id")
  deleteCertification(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.deleteCertification(user.companyId, id);
  }

  @Get("carbon-report")
  carbonReport(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.carbonReport(user.companyId, projectId);
  }

  @Get("carbon-summary")
  carbonSummary(@CurrentUser() user: AuthUser) {
    return this.service.carbonSummary(user.companyId);
  }
}
