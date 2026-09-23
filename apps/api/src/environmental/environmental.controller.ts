import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  addBmpInspectionSchema,
  createStormwaterPermitSchema,
  fileNoticeOfTerminationSchema,
  reportEnvironmentalIncidentSchema,
  updateEnvironmentalIncidentStatusSchema,
  type AddBmpInspectionInput,
  type AuthUser,
  type CreateStormwaterPermitInput,
  type FileNoticeOfTerminationInput,
  type ReportEnvironmentalIncidentInput,
  type UpdateEnvironmentalIncidentStatusInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { EnvironmentalService } from "./environmental.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@Requires("site.manage")
@Controller()
export class EnvironmentalController {
  constructor(private readonly service: EnvironmentalService) {}

  @Get("projects/:id/stormwater-permits")
  listPermitsForProject(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listPermitsForProject(user.companyId, id);
  }

  @Post("projects/:id/stormwater-permits")
  createPermit(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createStormwaterPermitSchema)) body: CreateStormwaterPermitInput,
  ) {
    return this.service.createPermit(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @ProjectResource("StormwaterPermit")
  @Post("stormwater-permits/:id/file-not")
  fileNoticeOfTermination(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(fileNoticeOfTerminationSchema)) body: FileNoticeOfTerminationInput,
  ) {
    return this.service.fileNoticeOfTermination(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @ProjectResource("StormwaterPermit")
  @Post("stormwater-permits/:id/inspections")
  addBmpInspection(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addBmpInspectionSchema)) body: AddBmpInspectionInput,
  ) {
    return this.service.addBmpInspection(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get("projects/:id/environmental-incidents")
  listIncidentsForProject(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listIncidentsForProject(user.companyId, id);
  }

  @Post("projects/:id/environmental-incidents")
  reportIncident(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reportEnvironmentalIncidentSchema)) body: ReportEnvironmentalIncidentInput,
  ) {
    return this.service.reportIncident(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @ProjectResource("EnvironmentalIncident")
  @Post("environmental-incidents/:id/status")
  updateIncidentStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateEnvironmentalIncidentStatusSchema)) body: UpdateEnvironmentalIncidentStatusInput,
  ) {
    return this.service.updateIncidentStatus(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
