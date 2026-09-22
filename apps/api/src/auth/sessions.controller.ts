import { Controller, Delete, Get, Param } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SessionsService } from "../common/sessions/sessions.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";

@NotProjectScoped("the caller's own sign-in sessions")
@Controller("auth/sessions")
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.sessions.list(user.userId);
  }

  @Delete(":id")
  revoke(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.sessions.revoke(user.userId, id);
  }
}
