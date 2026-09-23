import { Controller, Delete, Get, Query, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { DocusignService } from "./docusign.service";
import { Requires } from "../common/decorators/permissions.decorator";

@Controller()
export class DocusignController {
  constructor(
    private readonly service: DocusignService,
    private readonly config: ConfigService,
  ) {}

  @Requires("settings.integrations")
  @Get("company/docusign/status")
  status(@CurrentUser() user: AuthUser) {
    return this.service.getStatus(user.companyId);
  }

  @Requires("settings.integrations")
  @Get("company/docusign/authorize-url")
  authorizeUrl(@CurrentUser() user: AuthUser) {
    return { url: this.service.getAuthorizeUrl(user.companyId) };
  }

  @Requires("settings.integrations")
  @Delete("company/docusign/connection")
  disconnect(@CurrentUser() user: AuthUser) {
    return this.service.disconnect(user.companyId);
  }

  /** DocuSign redirects the browser here directly (a top-level navigation, not an XHR) — same
   * redirect-on-success-or-failure shape as AccountingSyncController's OAuth callback. */
  @Public()
  @Get("auth/docusign/callback")
  async callback(@Query("code") code: string, @Query("state") state: string, @Res() res: Response) {
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    try {
      await this.service.handleCallback(code, state);
      res.redirect(`${webOrigin}/settings?docusign_connected=1`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      res.redirect(`${webOrigin}/settings?docusign_error=${encodeURIComponent(message)}`);
    }
  }
}
