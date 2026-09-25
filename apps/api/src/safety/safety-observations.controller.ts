import { Body, Controller, Get, ParseUUIDPipe, Post, Query, ParseIntPipe } from "@nestjs/common";
import { createSafetyObservationSchema, type AuthUser, type CreateSafetyObservationInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SafetyObservationsService } from "./safety-observations.service";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";

@OpenToAllRoles("site and project work every member does")
@Controller("safety/observations")
export class SafetyObservationsController {
  constructor(private readonly service: SafetyObservationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId", ParseUUIDPipe) projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createSafetyObservationSchema)) body: CreateSafetyObservationInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Get("rate")
  rateByYear(@CurrentUser() user: AuthUser, @Query("year", ParseIntPipe) year: number) {
    return this.service.rateByYear(user.companyId, year);
  }
}
