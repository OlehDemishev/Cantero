import { Body, Controller, Delete, Get, Param, Patch } from "@nestjs/common";
import { upsertMessageTemplateSchema, type AuthUser, type MessageTemplateKey, type UpsertMessageTemplateInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { MessageTemplatesService } from "./message-templates.service";

@Controller("message-templates")
export class MessageTemplatesController {
  constructor(private readonly service: MessageTemplatesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Patch(":key")
  upsert(
    @CurrentUser() user: AuthUser,
    @Param("key") key: MessageTemplateKey,
    @Body(new ZodValidationPipe(upsertMessageTemplateSchema)) body: UpsertMessageTemplateInput,
  ) {
    return this.service.upsert(user.companyId, { userId: user.userId, name: user.name }, key, body.body);
  }

  @Delete(":key")
  reset(@CurrentUser() user: AuthUser, @Param("key") key: MessageTemplateKey) {
    return this.service.reset(user.companyId, { userId: user.userId, name: user.name }, key);
  }
}
