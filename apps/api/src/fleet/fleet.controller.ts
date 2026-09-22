import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  addVehicleFuelLogSchema,
  createVehicleSchema,
  logVehicleInspectionSchema,
  setDriverCdlExpirySchema,
  updateVehicleSchema,
  type AddVehicleFuelLogInput,
  type AuthUser,
  type CreateVehicleInput,
  type LogVehicleInspectionInput,
  type SetDriverCdlExpiryInput,
  type UpdateVehicleInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { FleetService } from "./fleet.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";

@NotProjectScoped("company vehicles and drivers")
@Controller()
export class FleetController {
  constructor(private readonly service: FleetService) {}

  @Get("vehicles")
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get("vehicles/fuel-efficiency-report")
  fuelEfficiencyReport(@CurrentUser() user: AuthUser) {
    return this.service.fuelEfficiencyReport(user.companyId);
  }

  @Get("vehicles/:id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post("vehicles")
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createVehicleSchema)) body: CreateVehicleInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch("vehicles/:id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateVehicleSchema)) body: UpdateVehicleInput,
  ) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post("vehicles/:id/inspections")
  logInspection(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(logVehicleInspectionSchema)) body: LogVehicleInspectionInput,
  ) {
    return this.service.logInspection(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get("vehicles/:id/fuel-logs")
  listFuelLogs(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listFuelLogs(user.companyId, id);
  }

  @Post("vehicles/:id/fuel-logs")
  addFuelLog(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addVehicleFuelLogSchema)) body: AddVehicleFuelLogInput,
  ) {
    return this.service.addFuelLog(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Patch("workers/:workerId/cdl")
  setDriverCdlExpiry(
    @CurrentUser() user: AuthUser,
    @Param("workerId") workerId: string,
    @Body(new ZodValidationPipe(setDriverCdlExpirySchema)) body: SetDriverCdlExpiryInput,
  ) {
    return this.service.setDriverCdlExpiry(user.companyId, { userId: user.userId, name: user.name }, workerId, body);
  }
}
