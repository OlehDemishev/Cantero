import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MAX_LOGO_UPLOAD_BYTES } from "../common/upload-limits";
import {
  linkToParentCompanySchema,
  setCustomPortalDomainSchema,
  updateCompanySchema,
  type AuthUser,
  type LinkToParentCompanyInput,
  type SetCustomPortalDomainInput,
  type UpdateCompanyInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CompanyService } from "./company.service";

@Controller("company")
export class CompanyController {
  constructor(private readonly service: CompanyService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.service.get(user.companyId);
  }

  @Get("referral")
  referralStats(@CurrentUser() user: AuthUser) {
    return this.service.referralStats(user.companyId);
  }

  @Roles("owner", "admin")
  @Patch()
  update(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(updateCompanySchema)) body: UpdateCompanyInput) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Roles("owner", "admin")
  @Post("complete-onboarding")
  completeOnboarding(@CurrentUser() user: AuthUser) {
    return this.service.completeOnboarding(user.companyId, { userId: user.userId, name: user.name });
  }

  @Roles("owner", "admin")
  @Post("logo")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_LOGO_UPLOAD_BYTES } }))
  async uploadLogo(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.uploadLogo(user.companyId, { userId: user.userId, name: user.name }, file);
  }

  @Get("logo")
  async logo(@CurrentUser() user: AuthUser) {
    const { buffer, mimeType } = await this.service.getLogo(user.companyId);
    return new StreamableFile(buffer, { type: mimeType });
  }

  @Roles("owner", "admin")
  @Post("deletion-request")
  requestDeletion(@CurrentUser() user: AuthUser) {
    return this.service.requestDeletion(user.companyId, { userId: user.userId, name: user.name }, user.email);
  }

  @Roles("owner", "admin")
  @Delete("deletion-request")
  cancelDeletionRequest(@CurrentUser() user: AuthUser) {
    return this.service.cancelDeletionRequest(user.companyId, { userId: user.userId, name: user.name });
  }

  @Roles("owner", "admin")
  @Post("calendar-feed-token")
  generateCalendarFeedToken(@CurrentUser() user: AuthUser) {
    return this.service.generateCalendarFeedToken(user.companyId, { userId: user.userId, name: user.name });
  }

  @Roles("owner")
  @Post("franchise-link-code")
  generateFranchiseLinkCode(@CurrentUser() user: AuthUser) {
    return this.service.generateFranchiseLinkCode(user.companyId, { userId: user.userId, name: user.name });
  }

  @Roles("owner")
  @Post("link-to-parent")
  linkToParent(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(linkToParentCompanySchema)) body: LinkToParentCompanyInput,
  ) {
    return this.service.linkToParent(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Get("franchise-overview")
  franchiseOverview(@CurrentUser() user: AuthUser) {
    return this.service.franchiseOverview(user.companyId);
  }

  @Roles("owner", "admin")
  @Post("portal-domain")
  setCustomPortalDomain(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(setCustomPortalDomainSchema)) body: SetCustomPortalDomainInput,
  ) {
    return this.service.setCustomPortalDomain(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Roles("owner", "admin")
  @Post("portal-domain/verify")
  verifyCustomPortalDomain(@CurrentUser() user: AuthUser) {
    return this.service.verifyCustomPortalDomain(user.companyId, { userId: user.userId, name: user.name });
  }
}
