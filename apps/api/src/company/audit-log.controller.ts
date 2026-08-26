import { Controller, Get, Header, Query } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuditService, type AuditLogFilter } from "../common/audit/audit.service";

const PAGE_SIZE = 50;

@Roles("owner", "admin")
@Controller("company/audit-log")
export class AuditLogController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("cursor") cursor?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("entityType") entityType?: string,
    @Query("action") action?: string,
    @Query("actorUserId") actorUserId?: string,
  ) {
    return this.audit.list(user.companyId, PAGE_SIZE, cursor, this.parseFilter({ dateFrom, dateTo, entityType, action, actorUserId }));
  }

  @Get("export")
  @Header("Content-Type", "text/csv")
  exportCsv(
    @CurrentUser() user: AuthUser,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("entityType") entityType?: string,
    @Query("action") action?: string,
    @Query("actorUserId") actorUserId?: string,
  ) {
    return this.audit.exportCsv(user.companyId, this.parseFilter({ dateFrom, dateTo, entityType, action, actorUserId }));
  }

  private parseFilter(raw: {
    dateFrom?: string;
    dateTo?: string;
    entityType?: string;
    action?: string;
    actorUserId?: string;
  }): AuditLogFilter {
    return {
      dateFrom: raw.dateFrom ? new Date(raw.dateFrom) : undefined,
      dateTo: raw.dateTo ? new Date(raw.dateTo) : undefined,
      entityType: raw.entityType,
      action: raw.action,
      actorUserId: raw.actorUserId,
    };
  }
}
