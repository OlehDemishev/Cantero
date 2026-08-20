import { Body, Controller, Get, Header, Param, Post, Req, StreamableFile, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { clientDecisionSchema, type ClientDecisionInput } from "@cantero/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { PortalAuthGuard } from "./portal-auth.guard";
import { CurrentPortalClient } from "./current-portal-client.decorator";
import type { PortalClientContext } from "./portal-jwt.service";
import { PortalService } from "./portal.service";

/** @Public() bypasses the internal-user JwtAuthGuard chain; PortalAuthGuard independently requires a valid client-portal token. */
@Public()
@UseGuards(PortalAuthGuard)
@Controller("portal")
export class PortalController {
  constructor(private readonly service: PortalService) {}

  @Get("me")
  me(@CurrentPortalClient() client: PortalClientContext) {
    return this.service.me(client);
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
    @Body(new ZodValidationPipe(clientDecisionSchema)) body: ClientDecisionInput,
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
}
