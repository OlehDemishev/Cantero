import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  createMaterialCatalogItemSchema,
  updateMaterialReorderSchema,
  type AuthUser,
  type CreateMaterialCatalogItemInput,
  type UpdateMaterialReorderInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { MaterialCatalogService } from "./material-catalog.service";

@Controller("materials/catalog")
export class MaterialCatalogController {
  constructor(private readonly service: MaterialCatalogService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Get(":id/price-history")
  priceHistory(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.priceHistory(user.companyId, id);
  }

  @Get(":id/supplier-prices")
  supplierPrices(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.supplierPrices(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createMaterialCatalogItemSchema)) body: CreateMaterialCatalogItemInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Post("import")
  @UseInterceptors(FileInterceptor("file"))
  importCsv(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.importCsv(user.companyId, { userId: user.userId, name: user.name }, file.buffer.toString("utf-8"));
  }

  @Patch(":id/reorder-settings")
  updateReorderSettings(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateMaterialReorderSchema)) body: UpdateMaterialReorderInput,
  ) {
    return this.service.updateReorderSettings(user.companyId, id, body);
  }
}
