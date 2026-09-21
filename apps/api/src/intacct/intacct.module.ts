import { Module } from "@nestjs/common";
import { IntacctController } from "./intacct.controller";
import { IntacctService } from "./intacct.service";

@Module({
  controllers: [IntacctController],
  providers: [IntacctService],
})
export class IntacctModule {}
