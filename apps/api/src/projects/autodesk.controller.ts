import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IsString } from "class-validator";
import type { Response } from "express";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";
import { AutodeskService } from "./autodesk.service";

class SyncAutodeskDto {
  @IsString()
  autodeskProjectId!: string;
}

@Controller()
export class AutodeskController {
  constructor(
    private readonly service: AutodeskService,
    private readonly config: ConfigService,
  ) {}

  @Roles("owner", "admin", "accountant")
  @Get("company/autodesk/status")
  status(@CurrentUser() user: AuthUser) {
    return this.service.getStatus(user.companyId);
  }

  @Roles("owner", "admin", "accountant")
  @Get("company/autodesk/authorize-url")
  authorizeUrl(@CurrentUser() user: AuthUser) {
    return { url: this.service.getAuthorizeUrl(user.companyId) };
  }

  @Roles("owner", "admin", "accountant")
  @Delete("company/autodesk/connection")
  disconnect(@CurrentUser() user: AuthUser) {
    return this.service.disconnect(user.companyId);
  }

  @Post("projects/:id/sync-autodesk")
  syncPunchList(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: SyncAutodeskDto) {
    if (!body.autodeskProjectId) throw new BadRequestException("autodeskProjectId is required");
    return this.service.syncPunchList(user.companyId, id, body.autodeskProjectId);
  }

  /** Autodesk redirects the browser here directly (a top-level navigation, not an XHR) — same
   * redirect-on-success-or-failure shape as the other OAuth callbacks in this codebase. */
  @Public()
  @Get("auth/autodesk/callback")
  async callback(@Query("code") code: string, @Query("state") state: string, @Res() res: Response) {
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    try {
      await this.service.handleCallback(code, state);
      res.redirect(`${webOrigin}/settings?autodesk_connected=1`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      res.redirect(`${webOrigin}/settings?autodesk_error=${encodeURIComponent(message)}`);
    }
  }
}
