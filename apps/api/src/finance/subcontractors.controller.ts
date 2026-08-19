import { Body, Controller, Get, Post } from "@nestjs/common";
import { createSubcontractorSchema, type AuthUser, type CreateSubcontractorInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SubcontractorsService } from "./subcontractors.service";

@Controller("finance/subcontractors")
export class SubcontractorsController {
  constructor(private readonly service: SubcontractorsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSubcontractorSchema)) body: CreateSubcontractorInput,
  ) {
    return this.service.create(user.companyId, body);
  }
}
