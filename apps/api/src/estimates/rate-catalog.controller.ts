import { BadRequestException, Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { createRateCatalogItemSchema, type AuthUser, type CreateRateCatalogItemInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { RateCatalogService } from "./rate-catalog.service";

@Controller("estimates/rate-catalog")
export class RateCatalogController {
  constructor(private readonly service: RateCatalogService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
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

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createRateCatalogItemSchema)) body: CreateRateCatalogItemInput,
  ) {
    return this.service.create(user.companyId, body);
  }
}
