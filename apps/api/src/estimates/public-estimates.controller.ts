import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { estimateClientDecisionSchema, type EstimateClientDecisionInput } from "@cantero/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { EstimatesService } from "./estimates.service";

/** Unauthenticated — reached only via the random token embedded in the review link estimates.send() generates. */
@Controller("public/estimates")
export class PublicEstimatesController {
  constructor(private readonly service: EstimatesService) {}

  @Public()
  @Get(":token")
  get(@Param("token") token: string) {
    return this.service.getByToken(token);
  }

  @Public()
  @Post(":token/decision")
  decide(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(estimateClientDecisionSchema)) body: EstimateClientDecisionInput,
    @Req() req: Request,
  ) {
    return this.service.decide(token, body, req.ip);
  }
}
