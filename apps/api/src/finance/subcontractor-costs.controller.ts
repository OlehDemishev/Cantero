import { Body, Controller, Get, Header, NotFoundException, Param, Post, Query, StreamableFile } from "@nestjs/common";
import {
  createSubcontractorCostSchema,
  requestLienWaiverSchema,
  type AuthUser,
  type CreateSubcontractorCostInput,
  type RequestLienWaiverInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SubcontractorCostsService } from "./subcontractor-costs.service";

@Controller("finance/subcontractor-costs")
export class SubcontractorCostsController {
  constructor(private readonly service: SubcontractorCostsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId?: string) {
    return this.service.list(user.companyId, projectId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSubcontractorCostSchema)) body: CreateSubcontractorCostInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Post(":id/mark-paid")
  markPaid(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.markPaid(user.companyId, id);
  }

  @Get(":id/lien-waiver")
  async getLienWaiver(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const waiver = await this.service.getLienWaiver(user.companyId, id);
    if (!waiver) throw new NotFoundException("No lien waiver on file for this cost");
    return waiver;
  }

  @Post(":id/lien-waiver")
  requestLienWaiver(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(requestLienWaiverSchema)) body: RequestLienWaiverInput,
  ) {
    return this.service.requestLienWaiver(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get(":id/lien-waiver/pdf")
  @Header("Content-Type", "application/pdf")
  async getLienWaiverPdf(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.service.getLienWaiverPdf(user.companyId, id);
    return new StreamableFile(buffer);
  }
}
