import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { clientDecisionSchema, type ClientDecisionInput } from "@cantero/shared";
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
  decide(@Param("token") token: string, @Body(new ZodValidationPipe(clientDecisionSchema)) body: ClientDecisionInput) {
    return this.service.decide(token, body);
  }
}
