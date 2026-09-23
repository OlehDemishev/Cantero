import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MAX_UPLOAD_BYTES } from "../common/upload-limits";
import {
  createMaterialCatalogItemSchema,
  updateMaterialBarcodeSchema,
  updateMaterialLotTrackedSchema,
  updateMaterialPriceSchema,
  updateMaterialReorderSchema,
  updateMaterialSerialTrackedSchema,
  updateMaterialStandardCostSchema,
  updateMaterialSustainabilitySchema,
  updateMaterialUnitsSchema,
  type AuthUser,
  type CreateMaterialCatalogItemInput,
  type UpdateMaterialBarcodeInput,
  type UpdateMaterialLotTrackedInput,
  type UpdateMaterialPriceInput,
  type UpdateMaterialReorderInput,
  type UpdateMaterialSerialTrackedInput,
  type UpdateMaterialStandardCostInput,
  type UpdateMaterialSustainabilityInput,
  type UpdateMaterialUnitsInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { MaterialCatalogService } from "./material-catalog.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@NotProjectScoped("company material catalog items")
@Requires("pricing.manage")
@Controller("materials/catalog")
export class MaterialCatalogController {
  constructor(private readonly service: MaterialCatalogService) {}

  @OpenToAllRoles("every member reads these to do their own site work")
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  // Declared before ":id" so "price-changes"/"by-barcode" aren't swallowed as a material id.
  @Requires("purchasing.view")
  @Get("price-changes")
  priceChanges(@CurrentUser() user: AuthUser, @Query("sinceDays") sinceDays?: string) {
    return this.service.priceChanges(user.companyId, sinceDays ? Number(sinceDays) : undefined);
  }

  @OpenToAllRoles("every member reads these to do their own site work")
  @Get("by-barcode/:barcode")
  findByBarcode(@CurrentUser() user: AuthUser, @Param("barcode") barcode: string) {
    return this.service.findByBarcode(user.companyId, barcode);
  }

  @OpenToAllRoles("every member reads these to do their own site work")
  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Requires("purchasing.view")
  @Get(":id/price-history")
  priceHistory(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.priceHistory(user.companyId, id);
  }

  @Requires("purchasing.view")
  @Get(":id/supplier-prices")
  supplierPrices(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.supplierPrices(user.companyId, id);
  }

  @Requires("estimates.view")
  @Get(":id/affected-estimates")
  affectedOpenEstimates(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.affectedOpenEstimates(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createMaterialCatalogItemSchema)) body: CreateMaterialCatalogItemInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Post("import")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  importCsv(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.importCsv(user.companyId, { userId: user.userId, name: user.name }, file.buffer.toString("utf-8"));
  }

  @Patch(":id/price")
  updatePrice(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateMaterialPriceSchema)) body: UpdateMaterialPriceInput,
  ) {
    return this.service.updatePrice(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Requires("purchasing.manage")
  @Patch(":id/reorder-settings")
  updateReorderSettings(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateMaterialReorderSchema)) body: UpdateMaterialReorderInput,
  ) {
    return this.service.updateReorderSettings(user.companyId, id, body);
  }

  @Patch(":id/sustainability")
  updateSustainability(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateMaterialSustainabilitySchema)) body: UpdateMaterialSustainabilityInput,
  ) {
    return this.service.updateSustainability(user.companyId, id, body);
  }

  @Requires("purchasing.manage")
  @Patch(":id/barcode")
  updateBarcode(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateMaterialBarcodeSchema)) body: UpdateMaterialBarcodeInput,
  ) {
    return this.service.updateBarcode(user.companyId, id, body);
  }

  @Requires("purchasing.manage")
  @Patch(":id/lot-tracked")
  updateLotTracked(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateMaterialLotTrackedSchema)) body: UpdateMaterialLotTrackedInput,
  ) {
    return this.service.updateLotTracked(user.companyId, id, body);
  }

  @Patch(":id/units")
  updateUnits(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateMaterialUnitsSchema)) body: UpdateMaterialUnitsInput,
  ) {
    return this.service.updateUnits(user.companyId, id, body);
  }

  @Requires("purchasing.manage")
  @Patch(":id/serial-tracked")
  updateSerialTracked(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateMaterialSerialTrackedSchema)) body: UpdateMaterialSerialTrackedInput,
  ) {
    return this.service.updateSerialTracked(user.companyId, id, body);
  }

  @Patch(":id/standard-cost")
  updateStandardCost(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateMaterialStandardCostSchema)) body: UpdateMaterialStandardCostInput,
  ) {
    return this.service.updateStandardCost(user.companyId, id, body);
  }
}
