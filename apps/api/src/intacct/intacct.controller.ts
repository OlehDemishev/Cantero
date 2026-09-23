import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";
import {
  pushIntacctContractSchema,
  updateIntacctSettingsSchema,
  type AuthUser,
  type PushIntacctContractInput,
  type UpdateIntacctSettingsInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { IntacctService } from "./intacct.service";
import { Requires } from "../common/decorators/permissions.decorator";

@Controller()
export class IntacctController {
  constructor(
    private readonly service: IntacctService,
    private readonly config: ConfigService,
  ) {}

  @Requires("finance.manage")
  @Get("company/intacct/status")
  status(@CurrentUser() user: AuthUser) {
    return this.service.getStatus(user.companyId);
  }

  @Requires("finance.manage")
  @Get("company/intacct/authorize-url")
  authorizeUrl(@CurrentUser() user: AuthUser) {
    return { url: this.service.getAuthorizeUrl(user.companyId) };
  }

  @Requires("finance.manage")
  @Patch("company/intacct/settings")
  updateSettings(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(updateIntacctSettingsSchema)) body: UpdateIntacctSettingsInput) {
    return this.service.updateSettings(user.companyId, body.changeOrderItemId);
  }

  @Requires("finance.manage")
  @Delete("company/intacct/connection")
  disconnect(@CurrentUser() user: AuthUser) {
    return this.service.disconnect(user.companyId);
  }

  @Requires("finance.manage")
  @Post("projects/:id/intacct/contract")
  pushContract(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(pushIntacctContractSchema)) body: PushIntacctContractInput,
  ) {
    return this.service.pushProjectContract(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Requires("finance.manage")
  @Post("projects/:id/intacct/change-orders")
  pushChangeOrders(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.pushChangeOrders(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  /** Intacct redirects the browser here directly — same redirect-on-success-or-failure shape as
   * DocusignController's callback. */
  @Public()
  @Get("auth/intacct/callback")
  async callback(@Query("code") code: string, @Query("state") state: string, @Res() res: Response) {
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    try {
      await this.service.handleCallback(code, state);
      res.redirect(`${webOrigin}/settings?intacct_connected=1`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection failed";
      res.redirect(`${webOrigin}/settings?intacct_error=${encodeURIComponent(message)}`);
    }
  }
}
