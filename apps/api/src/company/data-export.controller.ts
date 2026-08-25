import { Controller, Get, Header, StreamableFile } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { DataExportService } from "./data-export.service";

@Controller("company")
export class DataExportController {
  constructor(private readonly service: DataExportService) {}

  @Roles("owner", "admin")
  @Get("data-export")
  @Header("Content-Type", "application/zip")
  async dataExport(@CurrentUser() user: AuthUser) {
    const buffer = await this.service.buildExport(user.companyId);
    return new StreamableFile(buffer);
  }
}
