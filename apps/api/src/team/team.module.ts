import { Module } from "@nestjs/common";
import { WorkersController } from "./workers.controller";
import { WorkersService } from "./workers.service";
import { TimeEntriesController } from "./time-entries.controller";
import { TimeEntriesService } from "./time-entries.service";

@Module({
  controllers: [WorkersController, TimeEntriesController],
  providers: [WorkersService, TimeEntriesService],
  exports: [WorkersService],
})
export class TeamModule {}
