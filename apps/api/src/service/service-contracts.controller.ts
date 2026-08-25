import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createServiceContractSchema,
  scheduleServiceVisitSchema,
  updateServiceContractSchema,
  type AuthUser,
  type CreateServiceContractInput,
  type ScheduleServiceVisitInput,
  type UpdateServiceContractInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ServiceContractsService } from "./service-contracts.service";
import { ServiceVisitsService } from "./service-visits.service";

@Controller("service-contracts")
export class ServiceContractsController {
  constructor(
    private readonly service: ServiceContractsService,
    private readonly visits: ServiceVisitsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createServiceContractSchema)) body: CreateServiceContractInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateServiceContractSchema)) body: UpdateServiceContractInput,
  ) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/visits")
  scheduleVisit(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(scheduleServiceVisitSchema)) body: ScheduleServiceVisitInput,
  ) {
    return this.visits.schedule(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
