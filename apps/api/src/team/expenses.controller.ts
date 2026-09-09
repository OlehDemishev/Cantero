import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MAX_UPLOAD_BYTES } from "../common/upload-limits";
import { createExpenseSchema, rejectExpenseSchema, type AuthUser, type CreateExpenseInput, type RejectExpenseInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ExpensesService } from "./expenses.service";
import { ReceiptOcrService } from "./receipt-ocr.service";

const EXPENSES_PAGE_SIZE = 100;

@Controller("expenses")
export class ExpensesController {
  constructor(
    private readonly service: ExpensesService,
    private readonly ocr: ReceiptOcrService,
  ) {}

  // Declared before ":id/..." routes so this literal segment isn't swallowed as an expense id.
  @Post("scan-receipt")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  scanReceipt(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.ocr.extract(file.buffer);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query("projectId") projectId?: string,
    @Query("workerId") workerId?: string,
    @Query("status") status?: string,
    @Query("cursor") cursor?: string,
  ) {
    return this.service.list(user.companyId, { projectId, workerId, status }, EXPENSES_PAGE_SIZE, cursor);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createExpenseSchema)) body: CreateExpenseInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Post(":id/receipt")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  uploadReceipt(@CurrentUser() user: AuthUser, @Param("id") id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.uploadReceipt(user.companyId, id, file);
  }

  @Get(":id/receipt")
  @Header("Content-Type", "application/octet-stream")
  async downloadReceipt(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const { buffer, mimeType } = await this.service.downloadReceipt(user.companyId, id);
    return new StreamableFile(buffer, { type: mimeType });
  }

  @Roles("owner", "admin", "accountant")
  @Post(":id/approve")
  approve(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.approve(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Roles("owner", "admin", "accountant")
  @Post(":id/reject")
  reject(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rejectExpenseSchema)) body: RejectExpenseInput,
  ) {
    return this.service.reject(user.companyId, { userId: user.userId, name: user.name }, id, body.reason);
  }
}
