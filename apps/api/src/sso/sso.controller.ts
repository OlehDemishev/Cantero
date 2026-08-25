import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import { updateSsoConfigSchema, startSsoLoginSchema, type AuthUser, type StartSsoLoginInput, type UpdateSsoConfigInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SsoService } from "./sso.service";

@Controller()
export class SsoController {
  constructor(
    private readonly service: SsoService,
    private readonly config: ConfigService,
  ) {}

  @Roles("owner", "admin")
  @Get("company/sso")
  getConfig(@CurrentUser() user: AuthUser) {
    return this.service.getConfig(user.companyId);
  }

  @Roles("owner", "admin")
  @Patch("company/sso")
  updateConfig(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateSsoConfigSchema)) body: UpdateSsoConfigInput,
  ) {
    return this.service.updateConfig(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Roles("owner", "admin")
  @Delete("company/sso")
  disable(@CurrentUser() user: AuthUser) {
    return this.service.disable(user.companyId, { userId: user.userId, name: user.name });
  }

  @Roles("owner", "admin")
  @Get("company/sso/metadata")
  @Header("Content-Type", "application/xml")
  spMetadata(@CurrentUser() user: AuthUser) {
    return this.service.spMetadata(user.companyId);
  }

  @Public()
  @Post("auth/sso/start")
  startLogin(@Body(new ZodValidationPipe(startSsoLoginSchema)) body: StartSsoLoginInput) {
    return this.service.startLogin(body.email);
  }

  /** The IdP POSTs the SAML assertion here directly (a real browser top-level navigation, not an XHR) — so success/failure is communicated by redirecting the browser back to the frontend rather than returning JSON. */
  @Public()
  @Post("auth/sso/acs/:companyId")
  async acs(@Param("companyId") companyId: string, @Body("SAMLResponse") samlResponse: string, @Res() res: Response) {
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    try {
      const { accessToken } = await this.service.handleAcs(companyId, samlResponse);
      res.redirect(`${webOrigin}/sso/callback?token=${encodeURIComponent(accessToken)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "SSO sign-in failed";
      res.redirect(`${webOrigin}/sso/callback?error=${encodeURIComponent(message)}`);
    }
  }
}
