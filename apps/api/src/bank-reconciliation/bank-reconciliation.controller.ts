import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MAX_UPLOAD_BYTES } from "../common/upload-limits";
import {
  createBankTransactionRuleSchema,
  matchBankTransactionSchema,
  setBankTransactionCategorySchema,
  type AuthUser,
  type CreateBankTransactionRuleInput,
  type MatchBankTransactionInput,
  type SetBankTransactionCategoryInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { BankReconciliationService } from "./bank-reconciliation.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";

@Roles("owner", "admin", "accountant")
@NotProjectScoped("the company bank feed; matching names an invoice or expense in the body")
@Controller("bank-transactions")
export class BankReconciliationController {
  constructor(private readonly service: BankReconciliationService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("reconciled") reconciled?: string) {
    const reconciledOnly = reconciled === undefined ? undefined : reconciled === "true";
    return this.service.list(user.companyId, reconciledOnly);
  }

  // Declared before "import" so this literal segment isn't ambiguous with future :id routes.
  @Get("suggested-matches")
  suggestMatches(@CurrentUser() user: AuthUser) {
    return this.service.suggestMatches(user.companyId);
  }

  @Get("rules")
  listRules(@CurrentUser() user: AuthUser) {
    return this.service.listRules(user.companyId);
  }

  @Post("rules")
  createRule(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createBankTransactionRuleSchema)) body: CreateBankTransactionRuleInput,
  ) {
    return this.service.createRule(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Delete("rules/:id")
  deleteRule(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.deleteRule(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post("apply-rules")
  applyRules(@CurrentUser() user: AuthUser) {
    return this.service.applyRules(user.companyId);
  }

  @Post("import")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  importCsv(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.importCsv(user.companyId, { userId: user.userId, name: user.name }, file.buffer.toString("utf-8"));
  }

  @Post(":id/match")
  match(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(matchBankTransactionSchema)) body: MatchBankTransactionInput,
  ) {
    return this.service.match(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post(":id/unmatch")
  unmatch(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.unmatch(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/category")
  setCategory(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setBankTransactionCategorySchema)) body: SetBankTransactionCategoryInput,
  ) {
    return this.service.setCategory(user.companyId, { userId: user.userId, name: user.name }, id, body.category);
  }
}
