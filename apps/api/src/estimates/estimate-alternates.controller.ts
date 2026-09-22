import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  createEstimateAlternateSchema,
  decideEstimateAlternateSchema,
  type AuthUser,
  type CreateEstimateAlternateInput,
  type DecideEstimateAlternateInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { EstimateAlternatesService } from "./estimate-alternates.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";

@Controller()
export class EstimateAlternatesController {
  constructor(private readonly service: EstimateAlternatesService) {}

  @ProjectResource("Estimate")
  @Get("estimates/:id/alternates")
  list(@CurrentUser() user: AuthUser, @Param("id") estimateId: string) {
    return this.service.listForEstimate(user.companyId, estimateId);
  }

  @ProjectResource("Estimate")
  @Post("estimates/:id/alternates")
  create(
    @CurrentUser() user: AuthUser,
    @Param("id") estimateId: string,
    @Body(new ZodValidationPipe(createEstimateAlternateSchema)) body: CreateEstimateAlternateInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, estimateId, body);
  }

  @ProjectResource("EstimateAlternate")
  @Post("estimate-alternates/:id/decide")
  decide(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(decideEstimateAlternateSchema)) body: DecideEstimateAlternateInput,
  ) {
    return this.service.decide(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
