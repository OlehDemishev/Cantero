import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  createRateCatalogItemSchema,
  updateRateCatalogItemSchema,
  evaluateFormulaSchema,
  type AuthUser,
  type CreateRateCatalogItemInput,
  type UpdateRateCatalogItemInput,
  type EvaluateFormulaInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { RateCatalogService } from "./rate-catalog.service";

@Controller("estimates/rate-catalog")
export class RateCatalogController {
  constructor(private readonly service: RateCatalogService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("catalogId") catalogId?: string) {
    return this.service.list(user.companyId, catalogId);
  }

  // Declared before ":id" so "starter"/"import" aren't swallowed as an item id.
  @Roles("owner", "admin")
  @Post("starter")
  seedStarter(@CurrentUser() user: AuthUser) {
    return this.service.seedStarter(user.companyId, { userId: user.userId, name: user.name });
  }

  @Post("import")
  @UseInterceptors(FileInterceptor("file"))
  importCsv(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.importCsv(user.companyId, { userId: user.userId, name: user.name }, file.buffer.toString("utf-8"));
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Get(":id/history")
  history(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.history(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createRateCatalogItemSchema)) body: CreateRateCatalogItemInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateRateCatalogItemSchema)) body: UpdateRateCatalogItemInput,
  ) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/evaluate-formula")
  evaluateFormula(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(evaluateFormulaSchema)) body: EvaluateFormulaInput,
  ) {
    return this.service.evaluateFormula(user.companyId, id, body);
  }
}
