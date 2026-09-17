import { BadRequestException, Body, Controller, Get, Param, Post, Res, StreamableFile, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import {
  matchIncomingEInvoiceSupplierSchema,
  rejectIncomingEInvoiceSchema,
  type AuthUser,
  type MatchIncomingEInvoiceSupplierInput,
  type RejectIncomingEInvoiceInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { MAX_UPLOAD_BYTES } from "../common/upload-limits";
import { IncomingEInvoicesService } from "./incoming-e-invoices.service";

@Controller("finance/incoming-invoices")
export class IncomingEInvoicesController {
  constructor(private readonly service: IncomingEInvoicesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  // Upload is open to any authenticated company member (no @Roles) — matching
  // DocumentsController's own upload route, since a foreman scanning a paper delivery ticket or
  // a bookkeeper forwarding a supplier email are both plausible sources, same reasoning as
  // Document uploads generally.
  @Post("upload")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.upload(user.companyId, { userId: user.userId, name: user.name }, file);
  }

  @Get(":id/raw-file")
  async rawFile(@CurrentUser() user: AuthUser, @Param("id") id: string, @Res({ passthrough: true }) res: Response) {
    const { buffer, fileName } = await this.service.getRawFile(user.companyId, id);
    res.set("Content-Disposition", `attachment; filename="${fileName}"`);
    return new StreamableFile(buffer);
  }

  @Post(":id/match-supplier")
  matchSupplier(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(matchIncomingEInvoiceSupplierSchema)) body: MatchIncomingEInvoiceSupplierInput,
  ) {
    return this.service.matchSupplier(user.companyId, { userId: user.userId, name: user.name }, id, body.supplierId);
  }

  // Converting to a real payable and rejecting are money-moving/legally-significant actions —
  // gated the same way invoices.controller.ts gates its own equivalent actions (:id/send,
  // :id/payments, etc.), unlike the open-to-everyone upload/match routes above.
  @Roles("owner", "admin", "accountant")
  @Post(":id/convert")
  convert(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.convertToVendorBill(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Roles("owner", "admin", "accountant")
  @Post(":id/reject")
  reject(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(rejectIncomingEInvoiceSchema)) body: RejectIncomingEInvoiceInput,
  ) {
    return this.service.reject(user.companyId, { userId: user.userId, name: user.name }, id, body.reason);
  }
}
