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
import { OpenToAllRoles } from "../common/decorators/roles.decorator";

/** Returns the current user + their company's settings (locale/currency/unitSystem) for the frontend shell. */
@OpenToAllRoles("each member's own account, settings and workspace")
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
      select: { emailDigestFrequency: true, mutedNotificationTypes: true },
    });
    const userRecord = await this.prisma.user.findUniqueOrThrow({ where: { id: user.userId }, select: { totpEnabledAt: true } });
    return {
      user: {
        id: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        // A custom role's added base roles — the web app hides what RolesGuard would refuse, and needs
        // these to decide the same way.
        additionalRoles: user.additionalRoles ?? [],
        // What this member may see and do — the web app hides the rest.
        permissions: user.permissions ?? [],
        totpEnabled: userRecord.totpEnabledAt !== null,
      },
      company,
      subscriptionStatus: subscription?.status ?? "incomplete",
      emailDigestFrequency: membership.emailDigestFrequency,
      mutedNotificationTypes: membership.mutedNotificationTypes,
    };
  }

  /** Computed live from real company state each time — not a persisted per-step tracker, so a
   * step that becomes true (or a record that gets deleted) is always reflected accurately. */
  @SkipSubscriptionCheck()
  @Get("onboarding-checklist")
  async onboardingChecklist(@CurrentUser() user: AuthUser) {
    const { companyId } = user;
    const [projectCount, clientCount, rateCatalogItemCount, estimateCount, memberCount] = await Promise.all([
      this.prisma.project.count({ where: { companyId } }),
      this.prisma.client.count({ where: { companyId } }),
      this.prisma.rateCatalogItem.count({ where: { companyId } }),
      this.prisma.estimate.count({ where: { companyId, isTemplate: false } }),
      this.prisma.membership.count({ where: { companyId } }),
    ]);

    return [
      { key: "create_project", done: projectCount > 0, link: "/projects" },
      { key: "add_client", done: clientCount > 0, link: "/clients" },
      { key: "build_rate_catalog", done: rateCatalogItemCount > 0, link: "/rate-catalog" },
      { key: "create_estimate", done: estimateCount > 0, link: "/projects" },
      { key: "invite_team", done: memberCount > 1, link: "/settings" },
    ];
  }

  @SkipSubscriptionCheck()
  @Patch("notification-preferences")
  async updateNotificationPreferences(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateNotificationPreferencesSchema)) body: UpdateNotificationPreferencesInput,
  ) {
    await this.prisma.membership.update({
      where: { userId_companyId: { userId: user.userId, companyId: user.companyId } },
      data: {
        emailDigestFrequency: body.emailDigestFrequency,
        mutedNotificationTypes: body.mutedNotificationTypes,
      },
    });
    return { ok: true };
  }
}
