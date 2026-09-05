import { Module } from "@nestjs/common";
import { ClientChangeRequestsController } from "./client-change-requests.controller";
import { ClientChangeRequestsService } from "./client-change-requests.service";

@Module({
  controllers: [ClientChangeRequestsController],
  providers: [ClientChangeRequestsService],
})
export class ClientChangeRequestsModule {}
