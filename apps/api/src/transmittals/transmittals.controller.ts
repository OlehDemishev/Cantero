import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  acknowledgeTransmittalSchema,
  createTransmittalSchema,
  type AcknowledgeTransmittalInput,
  type AuthUser,
  type CreateTransmittalInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { TransmittalsService } from "./transmittals.service";

@Controller()
export class TransmittalsController {
  constructor(private readonly service: TransmittalsService) {}

  @Get("projects/:id/transmittals")
  list(@CurrentUser() user: AuthUser, @Param("id") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Post("projects/:id/transmittals")
  create(
    @CurrentUser() user: AuthUser,
    @Param("id") projectId: string,
    @Body(new ZodValidationPipe(createTransmittalSchema)) body: CreateTransmittalInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, projectId, body);
  }

  @Post("transmittals/:id/acknowledge")
  acknowledge(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(acknowledgeTransmittalSchema)) body: AcknowledgeTransmittalInput,
  ) {
    return this.service.acknowledge(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
