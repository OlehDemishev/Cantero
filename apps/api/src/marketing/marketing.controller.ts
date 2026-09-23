import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createMarketingCampaignSchema,
  updateMarketingCampaignSchema,
  type AuthUser,
  type CreateMarketingCampaignInput,
  type UpdateMarketingCampaignInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { MarketingService } from "./marketing.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { RequiresFor } from "../common/decorators/permissions.decorator";

@NotProjectScoped("company marketing campaigns")
@RequiresFor("finance.view", "finance.manage")
@Controller("marketing")
export class MarketingController {
  constructor(private readonly service: MarketingService) {}

  @Get("campaigns")
  listCampaigns(@CurrentUser() user: AuthUser) {
    return this.service.listCampaigns(user.companyId);
  }

  @Post("campaigns")
  createCampaign(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createMarketingCampaignSchema)) body: CreateMarketingCampaignInput) {
    return this.service.createCampaign(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch("campaigns/:id")
  updateCampaign(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateMarketingCampaignSchema)) body: UpdateMarketingCampaignInput,
  ) {
    return this.service.updateCampaign(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get("roi-by-channel")
  roiByChannel(@CurrentUser() user: AuthUser) {
    return this.service.roiByChannel(user.companyId);
  }
}
