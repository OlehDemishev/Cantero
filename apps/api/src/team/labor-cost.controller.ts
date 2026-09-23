import { Controller, Get, Header, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { LaborCostService } from "./labor-cost.service";
import { Requires } from "../common/decorators/permissions.decorator";

@Controller("team/labor-cost-report")
export class LaborCostController {
  constructor(private readonly service: LaborCostService) {}

  @Requires("people.rates")
  @Get()
  get(@CurrentUser() user: AuthUser, @Query("from") from?: string, @Query("to") to?: string) {
    return this.service.report(user.companyId, { from, to });
  }

  @Roles("owner", "admin", "accountant")
  @Get("payroll-export")
  @Header("Content-Type", "text/csv")
  async payrollExport(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    res.set("Content-Disposition", "attachment; filename=payroll-export.csv");
    return this.service.payrollExportCsv(user.companyId, { from, to });
  }

  @Roles("owner", "admin", "accountant")
  @Get("payroll-export/adp")
  @Header("Content-Type", "text/csv")
  async payrollExportAdp(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    res.set("Content-Disposition", "attachment; filename=payroll-export-adp.csv");
    return this.service.payrollExportAdpCsv(user.companyId, { from, to });
  }

  @Roles("owner", "admin", "accountant")
  @Get("payroll-export/gusto")
  @Header("Content-Type", "text/csv")
  async payrollExportGusto(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    res.set("Content-Disposition", "attachment; filename=payroll-export-gusto.csv");
    return this.service.payrollExportGustoCsv(user.companyId, { from, to });
  }
}
