import { Body, Controller, Get, Patch } from "@nestjs/common";
import {
  updateNotificationPreferencesSchema,
  type AuthUser,
  type UpdateNotificationPreferencesInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SkipSubscriptionCheck } from "../common/decorators/skip-subscription-check.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PrismaService } from "../common/prisma/prisma.service";

/** Returns the current user + their company's settings (locale/currency/unitSystem) for the frontend shell. */
@Controller("me")
export class MeController {
  constructor(private readonly prisma: PrismaService) {}

  @SkipSubscriptionCheck()
  @Get()
  async me(@CurrentUser() user: AuthUser) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId } });
    const subscription = await this.prisma.subscription.findUnique({ where: { companyId: user.companyId } });
    const membership = await this.prisma.membership.findUniqueOrThrow({
      where: { userId_companyId: { userId: user.userId, companyId: user.companyId } },
      select: { emailDigestFrequency: true },
    });
    return {
      user: { id: user.userId, email: user.email, name: user.name, role: user.role },
      company,
      subscriptionStatus: subscription?.status ?? "incomplete",
      emailDigestFrequency: membership.emailDigestFrequency,
    };
  }

  @SkipSubscriptionCheck()
  @Patch("notification-preferences")
  async updateNotificationPreferences(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateNotificationPreferencesSchema)) body: UpdateNotificationPreferencesInput,
  ) {
    await this.prisma.membership.update({
      where: { userId_companyId: { userId: user.userId, companyId: user.companyId } },
      data: { emailDigestFrequency: body.emailDigestFrequency },
    });
    return { ok: true };
  }
}
