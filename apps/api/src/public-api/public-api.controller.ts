import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Public } from "../common/decorators/public.decorator";
import { ApiKeyCompanyId } from "../common/decorators/api-key-company.decorator";
import { RequireScope } from "../common/decorators/require-scope.decorator";
import { ApiKeyGuard } from "../common/guards/api-key.guard";
import { ApiKeyThrottlerGuard } from "../common/guards/api-key-throttler.guard";
import { PublicApiService, type ExportFormat } from "./public-api.service";

const FORMAT_QUERY = { name: "format", required: false, enum: ["json", "csv"], description: "Response format, defaults to json" };

/**
 * Read-only external integration API, authenticated via the X-Api-Key header
 * (see company/api-keys.*) instead of a user JWT. Every route supports
 * ?format=csv as an alternative to the default JSON response.
 */
@ApiTags("v1")
@ApiSecurity("apiKey")
@Public()
@UseGuards(ApiKeyGuard, ApiKeyThrottlerGuard)
@Controller("v1")
export class PublicApiController {
  constructor(private readonly service: PublicApiService) {}

  @ApiOperation({ summary: "List projects", description: "Requires the 'projects' key scope." })
  @ApiQuery(FORMAT_QUERY)
  @RequireScope("projects")
  @Get("projects")
  async projects(@ApiKeyCompanyId() companyId: string, @Query("format") format: string, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, format, () => this.service.projects(companyId, this.parseFormat(format)));
  }

  @ApiOperation({ summary: "List clients", description: "Requires the 'clients' key scope." })
  @ApiQuery(FORMAT_QUERY)
  @RequireScope("clients")
  @Get("clients")
  async clients(@ApiKeyCompanyId() companyId: string, @Query("format") format: string, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, format, () => this.service.clients(companyId, this.parseFormat(format)));
  }

  @ApiOperation({ summary: "List invoices", description: "Requires the 'invoices' key scope." })
  @ApiQuery(FORMAT_QUERY)
  @RequireScope("invoices")
  @Get("invoices")
  async invoices(@ApiKeyCompanyId() companyId: string, @Query("format") format: string, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, format, () => this.service.invoices(companyId, this.parseFormat(format)));
  }

  @ApiOperation({ summary: "List estimates", description: "Requires the 'estimates' key scope." })
  @ApiQuery(FORMAT_QUERY)
  @RequireScope("estimates")
  @Get("estimates")
  async estimates(@ApiKeyCompanyId() companyId: string, @Query("format") format: string, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, format, () => this.service.estimates(companyId, this.parseFormat(format)));
  }

  @ApiOperation({ summary: "List workers", description: "Requires the 'workers' key scope." })
  @ApiQuery(FORMAT_QUERY)
  @RequireScope("workers")
  @Get("workers")
  async workers(@ApiKeyCompanyId() companyId: string, @Query("format") format: string, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, format, () => this.service.workers(companyId, this.parseFormat(format)));
  }

  @ApiOperation({ summary: "List material catalog items", description: "Requires the 'materials' key scope." })
  @ApiQuery(FORMAT_QUERY)
  @RequireScope("materials")
  @Get("materials")
  async materials(@ApiKeyCompanyId() companyId: string, @Query("format") format: string, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, format, () => this.service.materials(companyId, this.parseFormat(format)));
  }

  @ApiOperation({ summary: "List time entries", description: "Requires the 'time-entries' key scope." })
  @ApiQuery(FORMAT_QUERY)
  @RequireScope("time-entries")
  @Get("time-entries")
  async timeEntries(@ApiKeyCompanyId() companyId: string, @Query("format") format: string, @Res({ passthrough: true }) res: Response) {
    return this.respond(res, format, () => this.service.timeEntries(companyId, this.parseFormat(format)));
  }

  @ApiOperation({ summary: "Company-wide budget vs. actual", description: "Requires the 'budget' key scope." })
  @ApiQuery(FORMAT_QUERY)
  @RequireScope("budget")
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
