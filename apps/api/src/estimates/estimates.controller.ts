import { Body, Controller, Get, Header, Param, Post, StreamableFile } from "@nestjs/common";
import {
  createEstimateLineSchema,
  createEstimateSchema,
  type AuthUser,
  type CreateEstimateInput,
  type CreateEstimateLineInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { EstimatesService } from "./estimates.service";

@Controller("estimates")
export class EstimatesController {
  constructor(private readonly service: EstimatesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createEstimateSchema)) body: CreateEstimateInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Post(":id/lines")
  addLine(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createEstimateLineSchema)) body: CreateEstimateLineInput,
  ) {
    return this.service.addLine(user.companyId, id, body);
  }

  @Post(":id/approve")
  approve(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.approve(user.companyId, id);
  }

  @Get(":id/pdf")
  @Header("Content-Type", "application/pdf")
  async pdf(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.service.generatePdf(user.companyId, id);
    return new StreamableFile(buffer);
  }
}
