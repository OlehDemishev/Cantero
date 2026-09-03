import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  addTicketMessageSchema,
  assignTicketSchema,
  createSupportTicketSchema,
  updateTicketStatusSchema,
  upsertSlaPolicySchema,
  type AddTicketMessageInput,
  type AssignTicketInput,
  type AuthUser,
  type CreateSupportTicketInput,
  type TicketStatus,
  type UpdateTicketStatusInput,
  type UpsertSlaPolicyInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SupportTicketsService } from "./support-tickets.service";

@Controller("support-tickets")
export class SupportTicketsController {
  constructor(private readonly service: SupportTicketsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("status") status?: TicketStatus) {
    return this.service.list(user.companyId, status);
  }

  @Get("sla-policies")
  listSlaPolicies(@CurrentUser() user: AuthUser) {
    return this.service.listSlaPolicies(user.companyId);
  }

  @Post("sla-policies")
  upsertSlaPolicy(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(upsertSlaPolicySchema)) body: UpsertSlaPolicyInput) {
    return this.service.upsertSlaPolicy(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createSupportTicketSchema)) body: CreateSupportTicketInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Post(":id/status")
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTicketStatusSchema)) body: UpdateTicketStatusInput,
  ) {
    return this.service.updateStatus(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/assign")
  assign(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodValidationPipe(assignTicketSchema)) body: AssignTicketInput) {
    return this.service.assign(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/messages")
  addMessage(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addTicketMessageSchema)) body: AddTicketMessageInput,
  ) {
    return this.service.addMessage(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
