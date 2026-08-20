import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { createApiKeySchema, type AuthUser, type CreateApiKeyInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ApiKeysService } from "./api-keys.service";

@Roles("owner", "admin")
@Controller("company/api-keys")
export class ApiKeysController {
  constructor(private readonly service: ApiKeysService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createApiKeySchema)) body: CreateApiKeyInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Delete(":id")
  revoke(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.revoke(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
