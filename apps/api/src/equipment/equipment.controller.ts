import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  addFuelLogSchema,
  addMaintenanceRecordSchema,
  checkInEquipmentSchema,
  checkOutEquipmentSchema,
  createEquipmentSchema,
  recordEquipmentGpsPingSchema,
  startEquipmentRentalSchema,
  updateEquipmentSchema,
  updateMaintenanceScheduleSchema,
  updateMeterReadingSchema,
  type AddFuelLogInput,
  type AddMaintenanceRecordInput,
  type AuthUser,
  type CheckInEquipmentInput,
  type CheckOutEquipmentInput,
  type CreateEquipmentInput,
  type RecordEquipmentGpsPingInput,
  type StartEquipmentRentalInput,
  type UpdateEquipmentInput,
  type UpdateMaintenanceScheduleInput,
  type UpdateMeterReadingInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { EquipmentService } from "./equipment.service";

@Controller("equipment")
export class EquipmentController {
  constructor(private readonly service: EquipmentService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createEquipmentSchema)) body: CreateEquipmentInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateEquipmentSchema)) body: UpdateEquipmentInput,
  ) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/check-out")
  checkOut(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(checkOutEquipmentSchema)) body: CheckOutEquipmentInput,
  ) {
    return this.service.checkOut(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/check-in")
  checkIn(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(checkInEquipmentSchema)) body: CheckInEquipmentInput,
  ) {
    return this.service.checkIn(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/maintenance/start")
  startMaintenance(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.startMaintenance(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/maintenance/complete")
  completeMaintenance(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.completeMaintenance(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Patch(":id/maintenance-schedule")
  updateMaintenanceSchedule(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateMaintenanceScheduleSchema)) body: UpdateMaintenanceScheduleInput,
  ) {
    return this.service.updateMaintenanceSchedule(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Patch(":id/meter-reading")
  updateMeterReading(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateMeterReadingSchema)) body: UpdateMeterReadingInput,
  ) {
    return this.service.updateMeterReading(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/retire")
  retire(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.retire(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Get(":id/maintenance-records")
  listMaintenanceRecords(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listMaintenanceRecords(user.companyId, id);
  }

  @Post(":id/maintenance-records")
  addMaintenanceRecord(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addMaintenanceRecordSchema)) body: AddMaintenanceRecordInput,
  ) {
    return this.service.addMaintenanceRecord(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get(":id/fuel-logs")
  listFuelLogs(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listFuelLogs(user.companyId, id);
  }

  @Post(":id/fuel-logs")
  addFuelLog(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addFuelLogSchema)) body: AddFuelLogInput,
  ) {
    return this.service.addFuelLog(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get(":id/cost-per-hour")
  costPerHour(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.costPerHour(user.companyId, id);
  }

  @Get(":id/rentals")
  listRentals(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listRentals(user.companyId, id);
  }

  @Post(":id/rentals")
  startRental(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(startEquipmentRentalSchema)) body: StartEquipmentRentalInput,
  ) {
    return this.service.startRental(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/rentals/return")
  endRental(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.endRental(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Get(":id/assignments")
  listAssignments(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listAssignments(user.companyId, id);
  }

  @Post(":id/gps-pings")
  recordGpsPing(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(recordEquipmentGpsPingSchema)) body: RecordEquipmentGpsPingInput,
  ) {
    return this.service.recordGpsPing(user.companyId, id, body.lat, body.lng);
  }

  @Get(":id/gps-pings")
  listGpsPings(@CurrentUser() user: AuthUser, @Param("id") id: string, @Query("date") date?: string) {
    return this.service.listGpsPings(user.companyId, id, date);
  }
}
