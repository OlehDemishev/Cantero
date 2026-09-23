import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MAX_UPLOAD_BYTES } from "../common/upload-limits";
import {
  addSupplierDocumentSchema,
  createSupplierReviewSchema,
  createSupplierSchema,
  updateSupplierSchema,
  type AddSupplierDocumentInput,
  type AuthUser,
  type CreateSupplierInput,
  type CreateSupplierReviewInput,
  type UpdateSupplierInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SuppliersService } from "./suppliers.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";
import { RequiresFor } from "../common/decorators/permissions.decorator";

@NotProjectScoped("suppliers and their own documents and reviews")
@RequiresFor("purchasing.view", "purchasing.manage")
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

  @Get(":id/documents")
  listDocuments(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listDocuments(user.companyId, id);
  }

  @Post(":id/documents")
  addDocument(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addSupplierDocumentSchema)) body: AddSupplierDocumentInput,
  ) {
    return this.service.addDocument(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Delete(":id/documents/:documentId")
  deleteDocument(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("documentId") documentId: string) {
    return this.service.deleteDocument(user.companyId, id, documentId);
  }

  @Get(":id/reviews")
  listReviews(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listReviews(user.companyId, id);
  }

  @Post(":id/reviews")
  addReview(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createSupplierReviewSchema)) body: CreateSupplierReviewInput,
  ) {
    return this.service.addReview(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSupplierSchema)) body: CreateSupplierInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodValidationPipe(updateSupplierSchema)) body: UpdateSupplierInput) {
    return this.service.update(user.companyId, id, body);
  }

  @Post(":id/catalog-sync")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  syncCatalog(@CurrentUser() user: AuthUser, @Param("id") id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.syncCatalog(user.companyId, id, file.buffer.toString("utf-8"));
  }
}
