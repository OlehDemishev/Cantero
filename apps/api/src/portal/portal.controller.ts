import { Body, Controller, Delete, Get, Header, Param, Post, Req, StreamableFile, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import {
  clientDecisionSchema,
  estimateClientDecisionSchema,
  createClientChangeRequestSchema,
  createPortalMessageSchema,
  payInvoiceSchema,
  portalAddTicketMessageSchema,
  portalCreateTicketSchema,
  portalCreateWarrantyClaimSchema,
  type ClientDecisionInput,
  type CreateClientChangeRequestInput,
  type EstimateClientDecisionInput,
  type CreatePortalMessageInput,
  type PayInvoiceInput,
  type PortalAddTicketMessageInput,
  type PortalCreateTicketInput,
  type PortalCreateWarrantyClaimInput,
} from "@cantero/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PortalAuthGuard } from "./portal-auth.guard";
import { CurrentPortalClient } from "./current-portal-client.decorator";
import type { PortalClientContext } from "./portal-jwt.service";
import { PortalService } from "./portal.service";
import { PortalMessagesService } from "./portal-messages.service";
import { SupportTicketsService } from "../support-tickets/support-tickets.service";

/** @Public() bypasses the internal-user JwtAuthGuard chain; PortalAuthGuard independently requires a valid client-portal token. */
@Public()
@UseGuards(PortalAuthGuard)
@Controller("portal")
export class PortalController {
  constructor(
    private readonly service: PortalService,
    private readonly messages: PortalMessagesService,
    private readonly tickets: SupportTicketsService,
  ) {}

  @Get("me")
  me(@CurrentPortalClient() client: PortalClientContext) {
    return this.service.me(client);
  }

  @Post("payment-method/setup")
  setupPaymentMethod(@CurrentPortalClient() client: PortalClientContext) {
    return this.service.createPaymentMethodSetupSession(client);
  }

  @Delete("payment-method")
  removePaymentMethod(@CurrentPortalClient() client: PortalClientContext) {
    return this.service.removePaymentMethod(client);
  }

  @Get("estimates")
  listEstimates(@CurrentPortalClient() client: PortalClientContext) {
    return this.service.listEstimates(client);
  }

  @Get("estimates/:id")
  getEstimate(@CurrentPortalClient() client: PortalClientContext, @Param("id") id: string) {
    return this.service.getEstimate(client, id);
  }

  @Post("estimates/:id/decision")
  decideEstimate(
    @CurrentPortalClient() client: PortalClientContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(estimateClientDecisionSchema)) body: EstimateClientDecisionInput,
    @Req() req: Request,
  ) {
    return this.service.decideEstimate(client, id, body, req.ip);
  }

  @Get("estimates/:id/signature")
  @Header("Content-Type", "image/png")
  async getEstimateSignature(@CurrentPortalClient() client: PortalClientContext, @Param("id") id: string) {
    const buffer = await this.service.getEstimateSignature(client, id);
    return new StreamableFile(buffer);
  }

  @Get("estimates/:id/pdf")
  @Header("Content-Type", "application/pdf")
  async getEstimatePdf(@CurrentPortalClient() client: PortalClientContext, @Param("id") id: string) {
    const buffer = await this.service.getEstimatePdf(client, id);
    return new StreamableFile(buffer);
  }

  @Get("change-orders")
  listChangeOrders(@CurrentPortalClient() client: PortalClientContext) {
    return this.service.listChangeOrders(client);
  }

  @Get("change-orders/:id")
  getChangeOrder(@CurrentPortalClient() client: PortalClientContext, @Param("id") id: string) {
    return this.service.getChangeOrder(client, id);
  }

  @Post("change-orders/:id/decision")
  decideChangeOrder(
    @CurrentPortalClient() client: PortalClientContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(clientDecisionSchema)) body: ClientDecisionInput,
    @Req() req: Request,
  ) {
    return this.service.decideChangeOrder(client, id, body, req.ip);
  }

  @Get("change-orders/:id/signature")
  @Header("Content-Type", "image/png")
  async getChangeOrderSignature(@CurrentPortalClient() client: PortalClientContext, @Param("id") id: string) {
    const buffer = await this.service.getChangeOrderSignature(client, id);
    return new StreamableFile(buffer);
  }

  @Get("change-orders/:id/pdf")
  @Header("Content-Type", "application/pdf")
  async getChangeOrderPdf(@CurrentPortalClient() client: PortalClientContext, @Param("id") id: string) {
    const buffer = await this.service.getChangeOrderPdf(client, id);
    return new StreamableFile(buffer);
  }

  @Get("invoices")
  listInvoices(@CurrentPortalClient() client: PortalClientContext) {
    return this.service.listInvoices(client);
  }

  @Get("invoices/:id")
  getInvoice(@CurrentPortalClient() client: PortalClientContext, @Param("id") id: string) {
    return this.service.getInvoice(client, id);
  }

  @Get("invoices/:id/pdf")
  @Header("Content-Type", "application/pdf")
  async getInvoicePdf(@CurrentPortalClient() client: PortalClientContext, @Param("id") id: string) {
    const buffer = await this.service.getInvoicePdf(client, id);
    return new StreamableFile(buffer);
  }

  @Post("invoices/:id/pay")
  createPaymentCheckout(
    @CurrentPortalClient() client: PortalClientContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(payInvoiceSchema)) body: PayInvoiceInput,
  ) {
    return this.service.createPaymentCheckout(client, id, body.amount);
  }

  @Get("projects")
  listProjects(@CurrentPortalClient() client: PortalClientContext) {
    return this.service.listProjects(client);
  }

  @Get("projects/:id/messages")
  listMessages(@CurrentPortalClient() client: PortalClientContext, @Param("id") projectId: string) {
    return this.messages.listForClient(client, projectId);
  }

  @Post("projects/:id/messages")
  createMessage(
    @CurrentPortalClient() client: PortalClientContext,
    @Param("id") projectId: string,
    @Body(new ZodValidationPipe(createPortalMessageSchema)) body: CreatePortalMessageInput,
  ) {
    return this.messages.createForClient(client, projectId, body.content);
  }

  @Get("warranty")
  listWarrantyClaims(@CurrentPortalClient() client: PortalClientContext) {
    return this.service.listWarrantyClaims(client);
  }

  @Post("warranty")
  createWarrantyClaim(
    @CurrentPortalClient() client: PortalClientContext,
    @Body(new ZodValidationPipe(portalCreateWarrantyClaimSchema)) body: PortalCreateWarrantyClaimInput,
  ) {
    return this.service.createWarrantyClaim(client, body);
  }

  @Get("change-requests")
  listChangeRequests(@CurrentPortalClient() client: PortalClientContext) {
    return this.service.listChangeRequests(client);
  }

  @Post("change-requests")
  createChangeRequest(
    @CurrentPortalClient() client: PortalClientContext,
    @Body(new ZodValidationPipe(createClientChangeRequestSchema)) body: CreateClientChangeRequestInput,
  ) {
    return this.service.createChangeRequest(client, body);
  }

  @Get("tickets")
  listTickets(@CurrentPortalClient() client: PortalClientContext) {
    return this.tickets.listForClient(client);
  }

  @Get("tickets/:id")
  getTicket(@CurrentPortalClient() client: PortalClientContext, @Param("id") id: string) {
    return this.tickets.getForClient(client, id);
  }

  @Post("tickets")
  createTicket(
    @CurrentPortalClient() client: PortalClientContext,
    @Body(new ZodValidationPipe(portalCreateTicketSchema)) body: PortalCreateTicketInput,
  ) {
    return this.tickets.createForClient(client, body);
  }

  @Post("tickets/:id/messages")
  addTicketMessage(
    @CurrentPortalClient() client: PortalClientContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(portalAddTicketMessageSchema)) body: PortalAddTicketMessageInput,
  ) {
    return this.tickets.addMessageForClient(client, id, body);
  }
}
