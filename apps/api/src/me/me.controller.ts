import { Controller, Get } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SkipSubscriptionCheck } from "../common/decorators/skip-subscription-check.decorator";
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
    return {
      user: { id: user.userId, email: user.email, name: user.name, role: user.role },
      company,
      subscriptionStatus: subscription?.status ?? "incomplete",
    };
  }
}
