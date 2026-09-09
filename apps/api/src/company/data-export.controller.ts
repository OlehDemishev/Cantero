import { Controller, Get, Header, StreamableFile } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { DataExportService } from "./data-export.service";

@Controller("company")
export class DataExportController {
  constructor(private readonly service: DataExportService) {}

  // Both endpoints stream: the service registers each resource as a streamed archive entry and
  // calls finalize() before returning, so the ZIP starts reaching the client as soon as the
  // first bytes are ready rather than after every resource has been fully fetched.
  @Roles("owner", "admin")
  @Get("data-export")
  @Header("Content-Type", "application/zip")
  async dataExport(@CurrentUser() user: AuthUser) {
    const archive = await this.service.buildExport(user.companyId);
    return new StreamableFile(archive);
  }

  @Roles("owner", "admin")
  @Get("operational-export")
  @Header("Content-Type", "application/zip")
  operationalExport(@CurrentUser() user: AuthUser) {
    const archive = this.service.buildOperationalExport(user.companyId);
    return new StreamableFile(archive);
  }
}
