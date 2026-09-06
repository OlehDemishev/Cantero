import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "../common/decorators/public.decorator";
import { HealthService } from "./health.service";

@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /** For an orchestrator/load-balancer readiness probe — no auth (there's no user session to
   * check with), and a non-2xx status when any dependency is down so the probe actually fails
   * instead of reporting "ok" from a 200 with an "error" field buried in the body. */
  @Public()
  @Get()
  async check() {
    const report = await this.health.check();
    if (report.status !== "ok") {
      throw new ServiceUnavailableException(report);
    }
    return report;
  }
}
