import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { ProjectsModule } from "../projects/projects.module";
import { CrmModule } from "../crm/crm.module";
import { FinanceModule } from "../finance/finance.module";
import { EstimatesModule } from "../estimates/estimates.module";
import { TeamModule } from "../team/team.module";
import { MaterialsModule } from "../materials/materials.module";
import { PublicApiController } from "./public-api.controller";
import { PublicApiService } from "./public-api.service";
import { ApiKeyThrottlerGuard } from "../common/guards/api-key-throttler.guard";

@Module({
  imports: [
    ProjectsModule,
    CrmModule,
    FinanceModule,
    EstimatesModule,
    TeamModule,
    MaterialsModule,
    // 100 requests/minute per API key — machine-to-machine traffic, not a browser session.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
  ],
  controllers: [PublicApiController],
  providers: [PublicApiService, ApiKeyThrottlerGuard],
})
export class PublicApiModule {}
