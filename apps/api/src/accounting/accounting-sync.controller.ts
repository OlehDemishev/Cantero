import { BadRequestException, Controller, Delete, Get, Param, Post, Query, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { ACCOUNTING_PROVIDERS, type AccountingProviderType, type AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";
import { AccountingSyncService } from "./accounting-sync.service";

function assertProvider(provider: string): AccountingProviderType {
  if (!ACCOUNTING_PROVIDERS.includes(provider as AccountingProviderType)) {
    throw new BadRequestException(`Unknown accounting provider "${provider}"`);
  }
  return provider as AccountingProviderType;
}

@Controller()
export class AccountingSyncController {
  constructor(
    private readonly service: AccountingSyncService,
    private readonly config: ConfigService,
  ) {}

  @Roles("owner", "admin", "accountant")
  @Get("company/accounting/status")
  status(@CurrentUser() user: AuthUser) {
    return this.service.getStatus(user.companyId);
  }

  @Roles("owner", "admin", "accountant")
  @Get("company/accounting/authorize-url")
  authorizeUrl(@CurrentUser() user: AuthUser, @Query("provider") provider: string) {
    return { url: this.service.getAuthorizeUrl(user.companyId, assertProvider(provider)) };
  }

  @Roles("owner", "admin", "accountant")
  @Delete("company/accounting/connection")
  disconnect(@CurrentUser() user: AuthUser) {
    return this.service.disconnect(user.companyId);
  }

  @Roles("owner", "admin", "accountant")
  @Post("company/accounting/sync")
  sync(@CurrentUser() user: AuthUser) {
    return this.service.syncInvoices(user.companyId);
  }

  @Roles("owner", "admin", "accountant")
  @Post("company/accounting/sync-bills")
  syncBills(@CurrentUser() user: AuthUser) {
    return this.service.syncBills(user.companyId);
  }

  @Roles("owner", "admin", "accountant")
  @Get("company/accounting/sync-history")
  syncHistory(@CurrentUser() user: AuthUser) {
    return this.service.syncHistory(user.companyId);
  }

  @Roles("owner", "admin", "accountant")
  @Get("company/accounting/integrity-check")
  integrityCheck(@CurrentUser() user: AuthUser) {
    return this.service.integrityCheck(user.companyId);
  }

  /** The provider redirects the browser here directly (a top-level navigation, not an XHR) — success/failure is communicated by redirecting on to the frontend rather than returning JSON. */
  @Public()
  @Get("auth/accounting/callback/:provider")
  async callback(
    @Param("provider") providerParam: string,
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("realmId") realmId: string | undefined,
    @Res() res: Response,
  ) {
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    try {
      const provider = assertProvider(providerParam);
      await this.service.handleCallback(provider, code, state, realmId);
      res.redirect(`${webOrigin}/settings?accounting_connected=1`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      res.redirect(`${webOrigin}/settings?accounting_error=${encodeURIComponent(message)}`);
    }
  }
}
