import { Controller, Get } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ReportsService } from "./reports.service";

@Controller("reports")
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get("overview")
  overview(@CurrentUser() user: AuthUser) {
    return this.service.overview(user.companyId);
  }
}
