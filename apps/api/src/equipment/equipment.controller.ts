import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  addMaintenanceRecordSchema,
  checkOutEquipmentSchema,
  createEquipmentSchema,
  updateEquipmentSchema,
  type AddMaintenanceRecordInput,
  type AuthUser,
  type CheckOutEquipmentInput,
  type CreateEquipmentInput,
  type UpdateEquipmentInput,
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
  checkIn(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.checkIn(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/maintenance/start")
  startMaintenance(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.startMaintenance(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/maintenance/complete")
  completeMaintenance(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.completeMaintenance(user.companyId, { userId: user.userId, name: user.name }, id);
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

  @Get(":id/assignments")
  listAssignments(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listAssignments(user.companyId, id);
  }
}
