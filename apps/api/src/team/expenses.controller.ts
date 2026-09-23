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
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ExpensesService } from "./expenses.service";
import { ReceiptOcrService } from "./receipt-ocr.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { CREW, SelfScopeService } from "../common/permissions/self-scope.service";
import { Requires } from "../common/decorators/permissions.decorator";

const EXPENSES_PAGE_SIZE = 100;

@ProjectResource("Expense")
@OpenToAllRoles("every member files their own expenses; seeing the crew's needs site.crewTime or finance.view, approving needs finance.manage")
@Controller("expenses")
export class ExpensesController {
  constructor(
    private readonly service: ExpensesService,
    private readonly ocr: ReceiptOcrService,
    private readonly selfScope: SelfScopeService,
  ) {}

  // Declared before ":id/..." routes so this literal segment isn't swallowed as an expense id.
  @Post("scan-receipt")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  scanReceipt(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.ocr.extract(file.buffer);
  }

  @Get()
  async list(
    @CurrentUser() user: AuthUser,
    @Query("projectId") projectId?: string,
    @Query("workerId") workerId?: string,
    @Query("status") status?: string,
    @Query("cursor") cursor?: string,
  ) {
    const workerIds = await this.selfScope.listScope(user, workerId, CREW.expenses);
    return this.service.list(user.companyId, { projectId, workerId, workerIds, status }, EXPENSES_PAGE_SIZE, cursor, user);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createExpenseSchema)) body: CreateExpenseInput,
  ) {
    await this.selfScope.assertOwnWorker(user, body.workerId, CREW.expenses);
    return this.service.create(user.companyId, body);
  }

  @Post(":id/receipt")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async uploadReceipt(@CurrentUser() user: AuthUser, @Param("id") id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    await this.selfScope.assertOwnRecord(user, "expense", id, CREW.expenses);
    return this.service.uploadReceipt(user.companyId, id, file);
  }

  @Get(":id/receipt")
  @Header("Content-Type", "application/octet-stream")
  async downloadReceipt(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    await this.selfScope.assertOwnRecord(user, "expense", id, CREW.expenses);
    const { buffer, mimeType } = await this.service.downloadReceipt(user.companyId, id);
    return new StreamableFile(buffer, { type: mimeType });
  }

  @Requires("finance.manage")
  @Post(":id/approve")
  approve(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.approve(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Requires("finance.manage")
  @Post(":id/reject")
  reject(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rejectExpenseSchema)) body: RejectExpenseInput,
  ) {
    return this.service.reject(user.companyId, { userId: user.userId, name: user.name }, id, body.reason);
  }
}
