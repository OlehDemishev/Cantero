import { BadRequestException, Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { createSupplierSchema, type AuthUser, type CreateSupplierInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SuppliersService } from "./suppliers.service";

@Controller("materials/suppliers")
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Get(":id/scorecard")
  scorecard(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.scorecard(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSupplierSchema)) body: CreateSupplierInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Post(":id/catalog-sync")
  @UseInterceptors(FileInterceptor("file"))
  syncCatalog(@CurrentUser() user: AuthUser, @Param("id") id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.syncCatalog(user.companyId, id, file.buffer.toString("utf-8"));
  }
}
