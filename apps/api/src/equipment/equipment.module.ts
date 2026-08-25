import { Module } from "@nestjs/common";
import { EquipmentController } from "./equipment.controller";
import { EquipmentService } from "./equipment.service";
import { EquipmentMaintenanceSchedulerService } from "./equipment-maintenance-scheduler.service";
import { EquipmentMaintenanceProcessor } from "./equipment-maintenance.processor";

@Module({
  controllers: [EquipmentController],
  providers: [EquipmentService, EquipmentMaintenanceSchedulerService, EquipmentMaintenanceProcessor],
  exports: [EquipmentService],
})
export class EquipmentModule {}
