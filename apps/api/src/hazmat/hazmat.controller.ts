import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import {
  addHazmatInventoryItemSchema,
  addSdsVersionSchema,
  createHazardousMaterialSchema,
  type AddHazmatInventoryItemInput,
  type AddSdsVersionInput,
  type AuthUser,
  type CreateHazardousMaterialInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { HazmatService } from "./hazmat.service";

@Controller()
export class HazmatController {
  constructor(private readonly service: HazmatService) {}

  @Get("hazmat/materials")
  listMaterials(@CurrentUser() user: AuthUser) {
    return this.service.listMaterials(user.companyId);
  }

  @Get("hazmat/materials/:id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post("hazmat/materials")
  createMaterial(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createHazardousMaterialSchema)) body: CreateHazardousMaterialInput) {
    return this.service.createMaterial(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Post("hazmat/materials/:id/sds")
  addSdsVersion(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addSdsVersionSchema)) body: AddSdsVersionInput,
  ) {
    return this.service.addSdsVersion(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get("hazmat/stale-sds-report")
  staleSdsReport(@CurrentUser() user: AuthUser, @Query("reviewCycleMonths") reviewCycleMonths?: string) {
    return this.service.staleSdsReport(user.companyId, reviewCycleMonths ? Number(reviewCycleMonths) : undefined);
  }

  @Get("projects/:id/hazmat-inventory")
  listForProject(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listForProject(user.companyId, id);
  }

  @Post("projects/:id/hazmat-inventory")
  addToProjectInventory(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addHazmatInventoryItemSchema)) body: AddHazmatInventoryItemInput,
  ) {
    return this.service.addToProjectInventory(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Delete("hazmat-inventory/:id")
  removeFromProjectInventory(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.removeFromProjectInventory(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
