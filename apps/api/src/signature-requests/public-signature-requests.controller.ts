import { Body, Controller, Get, Header, Param, Post, Req, StreamableFile } from "@nestjs/common";
import type { Request } from "express";
import { signSignatureRequestSchema, type SignSignatureRequestInput } from "@cantero/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SignatureRequestsService } from "./signature-requests.service";

/** Unauthenticated — reached only via the per-signer token embedded in the link SignatureRequestsService.send()/sign() emails. */
@Controller("public/signature-requests")
export class PublicSignatureRequestsController {
  constructor(private readonly service: SignatureRequestsService) {}

  @Public()
  @Get(":token")
  get(@Param("token") token: string) {
    return this.service.getByToken(token);
  }

  @Public()
  @Get(":token/document")
  @Header("Content-Type", "application/octet-stream")
  async downloadDocument(@Param("token") token: string) {
    const { buffer, name } = await this.service.downloadDocumentByToken(token);
    return new StreamableFile(buffer, { disposition: `inline; filename="${name}"` });
  }

  @Public()
  @Post(":token/sign")
  sign(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(signSignatureRequestSchema)) body: SignSignatureRequestInput,
    @Req() req: Request,
  ) {
    return this.service.sign(token, body, req.ip);
  }
}
