import { Body, Controller, Delete, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { acceptInviteSchema, createInviteSchema, type AcceptInviteInput, type AuthUser, type CreateInviteInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { InvitesService } from "./invites.service";

@Controller()
export class InvitesController {
  constructor(private readonly service: InvitesService) {}

  @Roles("owner", "admin")
  @Get("company/invites")
  listPending(@CurrentUser() user: AuthUser) {
    return this.service.listPending(user.companyId);
  }

  @Roles("owner", "admin")
  @Post("company/invites")
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createInviteSchema)) body: CreateInviteInput) {
    return this.service.create(user.companyId, body);
  }

  @Roles("owner", "admin")
  @Delete("company/invites/:id")
  revoke(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.revoke(user.companyId, id);
  }

  @Public()
  @Get("invites/:token")
  getByToken(@Param("token") token: string) {
    return this.service.getByToken(token);
  }

  @Public()
  @Post("invites/accept")
  accept(@Body(new ZodValidationPipe(acceptInviteSchema)) body: AcceptInviteInput, @Req() req: Request) {
    return this.service.accept(body, { userAgent: req.headers["user-agent"], ipAddress: req.ip });
  }
}
