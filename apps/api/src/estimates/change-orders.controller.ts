import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import {
  addChangeOrderLineSchema,
  createChangeOrderSchema,
  type AddChangeOrderLineInput,
  type AuthUser,
  type CreateChangeOrderInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ChangeOrdersService } from "./change-orders.service";

@Controller("estimates/:estimateId/change-orders")
export class ChangeOrdersController {
  constructor(private readonly service: ChangeOrdersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param("estimateId") estimateId: string) {
    return this.service.list(user.companyId, estimateId);
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

  @Post(":id/approve")
  approve(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.approve(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/send")
  send(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.send(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
