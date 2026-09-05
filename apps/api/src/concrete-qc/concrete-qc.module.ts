import { Module } from "@nestjs/common";
import { ConcreteQcController } from "./concrete-qc.controller";
import { ConcreteQcService } from "./concrete-qc.service";

@Module({
  controllers: [ConcreteQcController],
  providers: [ConcreteQcService],
})
export class ConcreteQcModule {}
