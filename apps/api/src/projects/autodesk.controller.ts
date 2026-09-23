import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IsString, MaxLength, MinLength } from "class-validator";
import type { Response } from "express";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";
import { AutodeskService } from "./autodesk.service";
import { Requires } from "../common/decorators/permissions.decorator";

class SyncAutodeskDto {
  @IsString()
  autodeskProjectId!: string;
}

class SetAutodeskModelDto {
  @IsString()
  @MinLength(1)
  @MaxLength(600)
  urn!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;
}

@OpenToAllRoles("site and project work every member does")
@Controller()
export class AutodeskController {
  constructor(
    private readonly service: AutodeskService,
    private readonly config: ConfigService,
  ) {}

  @Requires("settings.integrations")
  @Get("company/autodesk/status")
  status(@CurrentUser() user: AuthUser) {
    return this.service.getStatus(user.companyId);
  }

  @Requires("settings.integrations")
  @Get("company/autodesk/authorize-url")
  authorizeUrl(@CurrentUser() user: AuthUser) {
    return { url: this.service.getAuthorizeUrl(user.companyId) };
  }

  @Requires("settings.integrations")
  @Delete("company/autodesk/connection")
  disconnect(@CurrentUser() user: AuthUser) {
    return this.service.disconnect(user.companyId);
  }

  // Routes are keyed by :projectId (not :id) so the global ProjectAccessGuard sees them.
  @Post("projects/:projectId/sync-autodesk")
  syncPunchList(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Body() body: SyncAutodeskDto) {
    if (!body.autodeskProjectId) throw new BadRequestException("autodeskProjectId is required");
    return this.service.syncPunchList(user.companyId, projectId, body.autodeskProjectId);
  }

  @Requires("site.manage")
  @Put("projects/:projectId/autodesk/project")
  linkProject(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Body() body: SyncAutodeskDto) {
    return this.service.linkProject(user.companyId, projectId, body.autodeskProjectId);
  }

  @Requires("site.manage")
  @Get("projects/:projectId/autodesk/models")
  browseModels(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Query("folderId") folderId?: string) {
    return this.service.browseModels(user.companyId, projectId, folderId || undefined);
  }

  @Requires("site.manage")
  @Put("projects/:projectId/autodesk/model")
  setModel(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string, @Body() body: SetAutodeskModelDto) {
    return this.service.setModel(user.companyId, projectId, { urn: body.urn, name: body.name });
  }

  @Requires("site.manage")
  @Delete("projects/:projectId/autodesk/model")
  clearModel(@CurrentUser() user: AuthUser, @Param("projectId") projectId: string) {
    return this.service.setModel(user.companyId, projectId, null);
  }

  /** Anyone who can open the project can look at its model. */
  @Get("projects/:projectId/autodesk/viewer-token")
  viewerToken(@CurrentUser() user: AuthUser) {
    return this.service.getViewerToken(user.companyId);
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
