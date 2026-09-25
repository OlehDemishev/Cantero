import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  acceptInviteSchema,
  createInviteSchema,
  verify2faSchema,
  type AcceptInviteInput,
  type AuthUser,
  type CreateInviteInput,
  type Verify2faInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { InvitesService } from "./invites.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@NotProjectScoped("company member invites")
@Controller()
export class InvitesController {
  constructor(private readonly service: InvitesService) {}

  @Requires("settings.roles")
  @Get("company/invites")
  listPending(@CurrentUser() user: AuthUser) {
    return this.service.listPending(user.companyId);
  }

  @Requires("settings.roles")
  @Post("company/invites")
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createInviteSchema)) body: CreateInviteInput) {
    return this.service.create(user.companyId, body, user.role);
  }

  @Requires("settings.roles")
  @Delete("company/invites/:id")
  revoke(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.revoke(user.companyId, id, user.role);
  }

  @Public()
  @Get("invites/:token")
  getByToken(@Param("token") token: string) {
    return this.service.getPublicByToken(token);
  }

  @Public()
  @Post("invites/accept")
  accept(@Body(new ZodValidationPipe(acceptInviteSchema)) body: AcceptInviteInput, @Req() req: Request) {
    return this.service.accept(body, { userAgent: req.headers["user-agent"], ipAddress: req.ip });
  }

  /** Completes accept() when the invited email belongs to an existing account with 2FA active. */
  @Public()
  @Post("invites/accept/2fa")
  acceptTwoFactor(@Body(new ZodValidationPipe(verify2faSchema)) body: Verify2faInput, @Req() req: Request) {
    return this.service.completeAcceptAfterTwoFactor(body, { userAgent: req.headers["user-agent"], ipAddress: req.ip });
  }
}
