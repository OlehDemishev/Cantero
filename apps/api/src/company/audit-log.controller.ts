import { Controller, Get, Query } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AuditService } from "../common/audit/audit.service";

const PAGE_SIZE = 50;

@Roles("owner", "admin")
@Controller("company/audit-log")
export class AuditLogController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("cursor") cursor?: string) {
    return this.audit.list(user.companyId, PAGE_SIZE, cursor);
  }
}
