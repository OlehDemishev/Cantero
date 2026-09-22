import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createWebhookEndpointSchema,
  updateWebhookEndpointSchema,
  type AuthUser,
  type CreateWebhookEndpointInput,
  type UpdateWebhookEndpointInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { WebhooksService } from "../common/webhooks/webhooks.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";

@Roles("owner", "admin")
@NotProjectScoped("company webhook endpoints")
@Controller("company/webhooks")
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get("catalog")
  catalog() {
    return this.service.catalog();
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createWebhookEndpointSchema)) body: CreateWebhookEndpointInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateWebhookEndpointSchema)) body: UpdateWebhookEndpointInput,
  ) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/regenerate-secret")
  regenerateSecret(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.regenerateSecret(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Get(":id/deliveries")
  listDeliveries(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listDeliveries(user.companyId, id);
  }

  @Delete(":id")
  delete(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.delete(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
