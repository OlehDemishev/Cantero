import { Controller, Get, Header, Query, StreamableFile } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SafetyAnalyticsService } from "./safety-analytics.service";

@Controller("safety/analytics")
export class SafetyAnalyticsController {
  constructor(private readonly service: SafetyAnalyticsService) {}

  @Get("osha-300a")
  osha300aSummary(@CurrentUser() user: AuthUser, @Query("year") year?: string) {
    return this.service.osha300aSummary(user.companyId, year ? Number(year) : new Date().getFullYear());
  }

  @Get("osha-300a/pdf")
  @Header("Content-Type", "application/pdf")
  async osha300aPdf(@CurrentUser() user: AuthUser, @Query("year") year?: string) {
    const buffer = await this.service.osha300aPdf(user.companyId, year ? Number(year) : new Date().getFullYear());
    return new StreamableFile(buffer, { disposition: `attachment; filename="osha-300a-summary.pdf"` });
  }

  @Get("scorecard")
  safetyScorecard(@CurrentUser() user: AuthUser, @Query("year") year?: string) {
    return this.service.safetyScorecard(user.companyId, year ? Number(year) : new Date().getFullYear(), user);
  }

  @Get("training-compliance")
  trainingCompliance(@CurrentUser() user: AuthUser, @Query("lookbackDays") lookbackDays?: string) {
    return this.service.trainingCompliance(user.companyId, lookbackDays ? Number(lookbackDays) : undefined);
  }

  @Get("near-miss")
  nearMissAnalytics(@CurrentUser() user: AuthUser, @Query("year") year?: string) {
    return this.service.nearMissAnalytics(user.companyId, year ? Number(year) : new Date().getFullYear(), user);
  }
}
