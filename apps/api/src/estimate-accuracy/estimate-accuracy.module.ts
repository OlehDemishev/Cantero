import { Module } from "@nestjs/common";
import { EstimateAccuracyController } from "./estimate-accuracy.controller";
import { EstimateAccuracyService } from "./estimate-accuracy.service";
import { CostBenchmarkService } from "./cost-benchmark.service";

@Module({
  controllers: [EstimateAccuracyController],
  providers: [EstimateAccuracyService, CostBenchmarkService],
})
export class EstimateAccuracyModule {}
