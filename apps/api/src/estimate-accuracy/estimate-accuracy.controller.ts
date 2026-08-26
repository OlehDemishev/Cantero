import { Controller, Get, Param } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { EstimateAccuracyService } from "./estimate-accuracy.service";
import { CostBenchmarkService } from "./cost-benchmark.service";

@Controller("estimate-accuracy")
export class EstimateAccuracyController {
  constructor(
    private readonly accuracy: EstimateAccuracyService,
    private readonly benchmark: CostBenchmarkService,
  ) {}

  @Get("rate-items")
  rateItemAccuracy(@CurrentUser() user: AuthUser) {
    return this.accuracy.rateItemAccuracy(user.companyId);
  }

  @Get("cost-benchmarks")
  costCodeBenchmarks(@CurrentUser() user: AuthUser) {
    return this.benchmark.costCodeBenchmarks(user.companyId);
  }

  @Get("cost-benchmarks/:estimateId")
  benchmarkForEstimate(@CurrentUser() user: AuthUser, @Param("estimateId") estimateId: string) {
    return this.benchmark.benchmarkForEstimate(user.companyId, estimateId);
  }
}
