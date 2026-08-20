import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { updateCompanySchema, type AuthUser, type UpdateCompanyInput } from "@cantero/shared";
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
  @UseInterceptors(FileInterceptor("file"))
  async uploadLogo(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.uploadLogo(user.companyId, { userId: user.userId, name: user.name }, file);
  }

  @Get("logo")
  async logo(@CurrentUser() user: AuthUser) {
    const { buffer, mimeType } = await this.service.getLogo(user.companyId);
    return new StreamableFile(buffer, { type: mimeType });
  }
}
