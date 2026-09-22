import { Body, Controller, Get, Post } from "@nestjs/common";
import {
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  registerDeviceSchema,
  unregisterDeviceSchema,
  type AuthUser,
  type RegisterDeviceInput,
  type UnregisterDeviceInput,
  type PushSubscribeInput,
  type PushUnsubscribeInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PushService } from "./push.service";

@Controller("notifications/push")
export class PushController {
  constructor(private readonly service: PushService) {}

  @Get("public-key")
  publicKey() {
    return this.service.getPublicKey();
  }

  @Post("subscribe")
  subscribe(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(pushSubscribeSchema)) body: PushSubscribeInput) {
    return this.service.subscribe(user.companyId, user.userId, body);
  }

  /** Cantero Field (the mobile app) registering its Expo push token. */
  @Post("devices")
  registerDevice(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(registerDeviceSchema)) body: RegisterDeviceInput) {
    return this.service.registerDevice(user.companyId, user.userId, body);
  }

  @Post("devices/unregister")
  unregisterDevice(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(unregisterDeviceSchema)) body: UnregisterDeviceInput) {
    return this.service.unregisterDevice(user.companyId, user.userId, body.token);
  }

  @Post("unsubscribe")
  unsubscribe(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(pushUnsubscribeSchema)) body: PushUnsubscribeInput,
  ) {
    return this.service.unsubscribe(user.companyId, user.userId, body.endpoint);
  }
}
