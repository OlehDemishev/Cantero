import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { Public } from "../common/decorators/public.decorator";
import { ApiKeyCompanyId } from "../common/decorators/api-key-company.decorator";
import { ApiKeyGuard } from "../common/guards/api-key.guard";
import { PublicApiService, type ExportFormat } from "./public-api.service";

/**
 * Read-only external integration API, authenticated via the X-Api-Key header
 * (see company/api-keys.*) instead of a user JWT. Every route supports
 * ?format=csv as an alternative to the default JSON response.
 */
@Public()
@UseGuards(ApiKeyGuard)
@Controller("v1")
export class PublicApiController {
  constructor(private readonly service: PublicApiService) {}

  @Get("projects")
  async projects(@ApiKeyCompanyId() companyId: string, @Query("format") format: string, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, format, () => this.service.projects(companyId, this.parseFormat(format)));
  }

  @Get("clients")
  async clients(@ApiKeyCompanyId() companyId: string, @Query("format") format: string, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, format, () => this.service.clients(companyId, this.parseFormat(format)));
  }

  @Get("invoices")
  async invoices(@ApiKeyCompanyId() companyId: string, @Query("format") format: string, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, format, () => this.service.invoices(companyId, this.parseFormat(format)));
  }

  @Get("estimates")
  async estimates(@ApiKeyCompanyId() companyId: string, @Query("format") format: string, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, format, () => this.service.estimates(companyId, this.parseFormat(format)));
  }

  @Get("workers")
  async workers(@ApiKeyCompanyId() companyId: string, @Query("format") format: string, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, format, () => this.service.workers(companyId, this.parseFormat(format)));
  }

  @Get("materials")
  async materials(@ApiKeyCompanyId() companyId: string, @Query("format") format: string, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, format, () => this.service.materials(companyId, this.parseFormat(format)));
  }

  @Get("time-entries")
  async timeEntries(@ApiKeyCompanyId() companyId: string, @Query("format") format: string, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, format, () => this.service.timeEntries(companyId, this.parseFormat(format)));
  }

  @Get("budget")
  async budget(@ApiKeyCompanyId() companyId: string, @Query("format") format: string, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, format, () => this.service.budget(companyId, this.parseFormat(format)));
  }

  private parseFormat(format: string | undefined): ExportFormat {
    return format === "csv" ? "csv" : "json";
  }

  private async respond<T>(res: Response, format: string | undefined, fn: () => Promise<T>) {
    const result = await fn();
    if (this.parseFormat(format) === "csv") res.set("Content-Type", "text/csv");
    return result;
  }
}
