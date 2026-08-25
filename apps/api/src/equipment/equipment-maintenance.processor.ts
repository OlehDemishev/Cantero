import { Logger } from "@nestjs/common";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { EQUIPMENT_MAINTENANCE_QUEUE } from "../common/queue/queue.module";
import { EquipmentMaintenanceSchedulerService } from "./equipment-maintenance-scheduler.service";

/** Fires on the repeatable schedule set up by EquipmentMaintenanceSchedulerService.onModuleInit — one pass over every company's overdue equipment. */
@Processor(EQUIPMENT_MAINTENANCE_QUEUE)
export class EquipmentMaintenanceProcessor extends WorkerHost {
  private readonly logger = new Logger(EquipmentMaintenanceProcessor.name);

  constructor(private readonly scheduler: EquipmentMaintenanceSchedulerService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const { flagged } = await this.scheduler.runDuePass();
    if (flagged > 0) this.logger.log(`Flagged ${flagged} overdue equipment item(s)`);
  }
}
