import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { HttpException, HttpStatus } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { SKIP_SUBSCRIPTION_CHECK_KEY } from "../decorators/skip-subscription-check.decorator";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Cantero is paid-from-day-one with no free tier: every route (except auth/webhooks
 * and the "start checkout" endpoint) requires an `active` Subscription on the caller's company.
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_SUBSCRIPTION_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic || skip) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthUser | undefined;
    if (!user) return true; // JwtAuthGuard runs first and already rejects unauthenticated requests

    const subscription = await this.prisma.subscription.findUnique({
      where: { companyId: user.companyId },
      select: { status: true },
    });

    if (subscription?.status !== "active") {
      throw new HttpException(
        "Subscription is not active — complete checkout to unlock the account",
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return true;
  }
}
