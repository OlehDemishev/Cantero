import { Body, Controller, Delete, Get, Header, Param, Post, StreamableFile } from "@nestjs/common";
import {
  addChangeOrderLineSchema,
  createChangeOrderSchema,
  declineOnBehalfOfClientSchema,
  setChangeOrderScheduleImpactSchema,
  type AddChangeOrderLineInput,
  type AuthUser,
  type CreateChangeOrderInput,
  type DeclineOnBehalfOfClientInput,
  type SetChangeOrderScheduleImpactInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ChangeOrdersService } from "./change-orders.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";

@ProjectResource("Estimate", "estimateId")
@ProjectResource("ChangeOrder")
@Controller("estimates/:estimateId/change-orders")
export class ChangeOrdersController {
  constructor(private readonly service: ChangeOrdersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param("estimateId") estimateId: string) {
    return this.service.list(user.companyId, estimateId);
  }

  @Get("profitability")
  profitability(@CurrentUser() user: AuthUser, @Param("estimateId") estimateId: string) {
    return this.service.profitability(user.companyId, estimateId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param("estimateId") estimateId: string,
    @Body(new ZodValidationPipe(createChangeOrderSchema)) body: CreateChangeOrderInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, estimateId, body);
  }

  @Post(":id/lines")
  addLine(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addChangeOrderLineSchema)) body: AddChangeOrderLineInput,
  ) {
    return this.service.addLine(user.companyId, id, body);
  }

  @Delete(":id/lines/:lineId")
  removeLine(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("lineId") lineId: string) {
    return this.service.removeLine(user.companyId, id, lineId);
  }

  @Post(":id/schedule-impact")
  setScheduleImpact(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setChangeOrderScheduleImpactSchema)) body: SetChangeOrderScheduleImpactInput,
  ) {
    return this.service.setScheduleImpact(user.companyId, id, body);
  }

  @Post(":id/approve")
  approve(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.approve(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/send")
  send(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.send(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  /** Records that the client declined outside the portal — see
   * ChangeOrdersService.declineOnBehalfOfClient. */
  @Post(":id/decline")
  declineOnBehalfOfClient(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(declineOnBehalfOfClientSchema)) body: DeclineOnBehalfOfClientInput,
  ) {
    return this.service.declineOnBehalfOfClient(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get(":id/pdf")
  @Header("Content-Type", "application/pdf")
  async pdf(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.service.generatePdf(user.companyId, id);
    return new StreamableFile(buffer);
  }

  @Get(":id/signature")
  @Header("Content-Type", "image/png")
  async signature(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.service.getSignature(user.companyId, id);
    return new StreamableFile(buffer);
  }
}
