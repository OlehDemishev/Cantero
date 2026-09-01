import { Body, Controller, Delete, Get, Param, Post, StreamableFile } from "@nestjs/common";
import { submitPublicLeadSchema, type AuthUser, type SubmitPublicLeadInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { LeadsService } from "./leads.service";

@Controller()
export class LeadsController {
  constructor(private readonly service: LeadsService) {}

  @Roles("owner", "admin")
  @Post("company/lead-form/regenerate")
  regenerate(@CurrentUser() user: AuthUser) {
    return this.service.regenerateFormToken(user.companyId, { userId: user.userId, name: user.name });
  }

  @Roles("owner", "admin")
  @Delete("company/lead-form")
  disable(@CurrentUser() user: AuthUser) {
    return this.service.disableFormToken(user.companyId, { userId: user.userId, name: user.name });
  }

  @Public()
  @Get("public/leads/:token")
  getFormInfo(@Param("token") token: string) {
    return this.service.getFormInfo(token);
  }

  @Public()
  @Post("public/leads/:token")
  submit(@Param("token") token: string, @Body(new ZodValidationPipe(submitPublicLeadSchema)) body: SubmitPublicLeadInput) {
    return this.service.submitLead(token, body);
  }

  @Public()
  @Get("public/leads/:token/logo")
  async showcaseLogo(@Param("token") token: string) {
    const { buffer, mimeType } = await this.service.getShowcaseLogo(token);
    return new StreamableFile(buffer, { type: mimeType });
  }

  @Public()
  @Get("public/leads/:token/photo/:documentId")
  async showcasePhoto(@Param("token") token: string, @Param("documentId") documentId: string) {
    const { buffer, mimeType } = await this.service.getShowcasePhoto(token, documentId);
    return new StreamableFile(buffer, { type: mimeType });
  }
}
