import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  createSubcontractorCostSchema,
  type AuthUser,
  type CreateSubcontractorCostInput,
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
}
