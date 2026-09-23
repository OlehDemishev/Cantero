import { BadRequestException, Controller, Delete, Get, Param, Post, Query, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IsString } from "class-validator";
import type { Response } from "express";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { MsProjectService } from "./ms-project.service";
import { Requires } from "../common/decorators/permissions.decorator";

class AuthorizeMsProjectDto {
  @IsString()
  environmentUrl!: string;
}

@Controller()
export class MsProjectController {
  constructor(
    private readonly service: MsProjectService,
    private readonly config: ConfigService,
  ) {}

  @Requires("settings.integrations")
  @Get("company/ms-project/status")
  status(@CurrentUser() user: AuthUser) {
    return this.service.getStatus(user.companyId);
  }

  @Requires("settings.integrations")
  @Get("company/ms-project/authorize-url")
  authorizeUrl(@CurrentUser() user: AuthUser, @Query() query: AuthorizeMsProjectDto) {
    if (!query.environmentUrl) throw new BadRequestException("environmentUrl is required");
    return { url: this.service.getAuthorizeUrl(user.companyId, query.environmentUrl) };
  }

  @Requires("settings.integrations")
  @Delete("company/ms-project/connection")
  disconnect(@CurrentUser() user: AuthUser) {
    return this.service.disconnect(user.companyId);
  }

  @Requires("settings.integrations")
  @Post("projects/:id/sync-ms-project")
  syncProject(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.syncProject(user.companyId, id);
  }

  /** Microsoft redirects the browser here directly (a top-level navigation, not an XHR) — same
   * redirect-on-success-or-failure shape as AccountingSyncController's/DocusignController's OAuth
   * callbacks. */
  @Public()
  @Get("auth/ms-project/callback")
  async callback(@Query("code") code: string, @Query("state") state: string, @Res() res: Response) {
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    try {
      await this.service.handleCallback(code, state);
      res.redirect(`${webOrigin}/settings?ms_project_connected=1`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      res.redirect(`${webOrigin}/settings?ms_project_error=${encodeURIComponent(message)}`);
    }
  }
}
