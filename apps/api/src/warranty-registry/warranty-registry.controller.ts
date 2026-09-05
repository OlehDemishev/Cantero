import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  createWarrantyRegistrationSchema,
  type AuthUser,
  type CreateWarrantyRegistrationInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { WarrantyRegistryService } from "./warranty-registry.service";

@Controller()
export class WarrantyRegistryController {
  constructor(private readonly service: WarrantyRegistryService) {}

  @Get("projects/:id/warranty-registrations")
  listForProject(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listForProject(user.companyId, id);
  }

  @Post("projects/:id/warranty-registrations")
  create(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createWarrantyRegistrationSchema)) body: CreateWarrantyRegistrationInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get("warranty-registrations/expiring")
  expiringWithin(@CurrentUser() user: AuthUser, @Query("days") days?: string) {
    return this.service.expiringWithin(user.companyId, days ? Number(days) : 90);
  }
}
