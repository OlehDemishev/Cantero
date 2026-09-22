import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  addUnitPriceMeasurementSchema,
  createTMTicketSchema,
  createUnitPriceItemSchema,
  decideTMTicketSchema,
  reviseTMTicketSchema,
  type AddUnitPriceMeasurementInput,
  type AuthUser,
  type CreateTMTicketInput,
  type CreateUnitPriceItemInput,
  type DecideTMTicketInput,
  type ReviseTMTicketInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { UnitPriceTmService } from "./unit-price-tm.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";

@Controller()
export class UnitPriceTmController {
  constructor(private readonly service: UnitPriceTmService) {}

  @Get("projects/:id/unit-price-items")
  listUnitPriceItems(@CurrentUser() user: AuthUser, @Param("id") projectId: string) {
    return this.service.listUnitPriceItems(user.companyId, projectId);
  }

  @Post("projects/:id/unit-price-items")
  createUnitPriceItem(
    @CurrentUser() user: AuthUser,
    @Param("id") projectId: string,
    @Body(new ZodValidationPipe(createUnitPriceItemSchema)) body: CreateUnitPriceItemInput,
  ) {
    return this.service.createUnitPriceItem(user.companyId, { userId: user.userId, name: user.name }, projectId, body);
  }

  @ProjectResource("UnitPriceItem")
  @Post("unit-price-items/:id/measurements")
  addMeasurement(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addUnitPriceMeasurementSchema)) body: AddUnitPriceMeasurementInput,
  ) {
    return this.service.addMeasurement(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @ProjectResource("UnitPriceItem")
  @Get("unit-price-items/:id/billing-summary")
  billingSummary(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.billingSummary(user.companyId, id);
  }

  @Get("projects/:id/tm-tickets")
  listTMTickets(@CurrentUser() user: AuthUser, @Param("id") projectId: string) {
    return this.service.listTMTickets(user.companyId, projectId);
  }

  @Post("projects/:id/tm-tickets")
  createTMTicket(
    @CurrentUser() user: AuthUser,
    @Param("id") projectId: string,
    @Body(new ZodValidationPipe(createTMTicketSchema)) body: CreateTMTicketInput,
  ) {
    return this.service.createTMTicket(user.companyId, { userId: user.userId, name: user.name }, projectId, body);
  }

  @ProjectResource("TMTicket")
  @Post("tm-tickets/:id/decide")
  decideTMTicket(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(decideTMTicketSchema)) body: DecideTMTicketInput,
  ) {
    return this.service.decideTMTicket(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @ProjectResource("TMTicket")
  @Post("tm-tickets/:id/revise")
  reviseTMTicket(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reviseTMTicketSchema)) body: ReviseTMTicketInput,
  ) {
    return this.service.reviseTMTicket(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
