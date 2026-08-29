import { BadRequestException, Body, Controller, Get, Header, Param, Post, Query, StreamableFile } from "@nestjs/common";
import {
  generateCertifiedPayrollSchema,
  signCertifiedPayrollSchema,
  type AuthUser,
  type GenerateCertifiedPayrollInput,
  type SignCertifiedPayrollInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CertifiedPayrollService } from "./certified-payroll.service";

@Controller()
export class CertifiedPayrollController {
  constructor(private readonly service: CertifiedPayrollService) {}

  @Get("projects/:id/certified-payroll")
  list(@CurrentUser() user: AuthUser, @Param("id") projectId: string) {
    return this.service.list(user.companyId, projectId);
  }

  @Get("projects/:id/certified-payroll/preview")
  async preview(@CurrentUser() user: AuthUser, @Param("id") projectId: string, @Query("weekEndingDate") weekEndingDate?: string) {
    if (!weekEndingDate) throw new BadRequestException("weekEndingDate is required");
    const date = new Date(weekEndingDate);
    if (Number.isNaN(date.getTime())) throw new BadRequestException("Invalid weekEndingDate");
    return this.service.computeWeek(user.companyId, projectId, date);
  }

  @Post("projects/:id/certified-payroll/generate")
  generate(
    @CurrentUser() user: AuthUser,
    @Param("id") projectId: string,
    @Body(new ZodValidationPipe(generateCertifiedPayrollSchema)) body: GenerateCertifiedPayrollInput,
  ) {
    return this.service.generate(user.companyId, { userId: user.userId, name: user.name }, projectId, body.weekEndingDate);
  }

  @Post("projects/:id/certified-payroll/no-work")
  markNoWorkPerformed(
    @CurrentUser() user: AuthUser,
    @Param("id") projectId: string,
    @Body(new ZodValidationPipe(generateCertifiedPayrollSchema)) body: GenerateCertifiedPayrollInput,
  ) {
    return this.service.markNoWorkPerformed(user.companyId, { userId: user.userId, name: user.name }, projectId, body.weekEndingDate);
  }

  @Post("certified-payroll/:id/sign")
  sign(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(signCertifiedPayrollSchema)) body: SignCertifiedPayrollInput,
  ) {
    return this.service.sign(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get("certified-payroll/:id/pdf")
  @Header("Content-Type", "application/pdf")
  async pdf(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.service.pdf(user.companyId, id);
    return new StreamableFile(buffer, { disposition: `attachment; filename="certified-payroll-${id}.pdf"` });
  }
}
