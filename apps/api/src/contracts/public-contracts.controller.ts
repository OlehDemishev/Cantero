import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { signContractSchema, type SignContractInput } from "@cantero/shared";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ContractsService } from "./contracts.service";

/** Unauthenticated — reached only via the random token embedded in the signing link ContractsService.send() generates. */
@Controller("public/contracts")
export class PublicContractsController {
  constructor(private readonly service: ContractsService) {}

  @Public()
  @Get(":token")
  get(@Param("token") token: string) {
    return this.service.getByToken(token);
  }

  @Public()
  @Post(":token/sign")
  sign(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(signContractSchema)) body: SignContractInput,
    @Req() req: Request,
  ) {
    return this.service.sign(token, body, req.ip);
  }
}
