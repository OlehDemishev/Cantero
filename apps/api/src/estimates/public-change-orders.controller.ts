import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { clientDecisionSchema, type ClientDecisionInput } from "@cantero/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ChangeOrdersService } from "./change-orders.service";

/** Unauthenticated — reached only via the random token embedded in the review link changeOrders.send() generates. */
@Controller("public/change-orders")
export class PublicChangeOrdersController {
  constructor(private readonly service: ChangeOrdersService) {}

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
