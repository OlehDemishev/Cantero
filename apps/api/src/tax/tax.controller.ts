import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createTaxExemptionCertificateSchema,
  createTaxJurisdictionSchema,
  createTaxRateSchema,
  setClientTaxJurisdictionSchema,
  updateTaxJurisdictionSchema,
  type AuthUser,
  type CreateTaxExemptionCertificateInput,
  type CreateTaxJurisdictionInput,
  type CreateTaxRateInput,
  type SetClientTaxJurisdictionInput,
  type UpdateTaxJurisdictionInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { TaxService } from "./tax.service";
import { NotProjectScoped, ProjectResource } from "../common/project-access/project-resource.decorator";

@Controller()
export class TaxController {
  constructor(private readonly service: TaxService) {}

  @Get("tax/jurisdictions")
  listJurisdictions(@CurrentUser() user: AuthUser) {
    return this.service.listJurisdictions(user.companyId);
  }

  @Post("tax/jurisdictions")
  createJurisdiction(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createTaxJurisdictionSchema)) body: CreateTaxJurisdictionInput) {
    return this.service.createJurisdiction(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @NotProjectScoped("company tax jurisdictions")
  @Patch("tax/jurisdictions/:id")
  updateJurisdiction(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTaxJurisdictionSchema)) body: UpdateTaxJurisdictionInput,
  ) {
    return this.service.updateJurisdiction(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @NotProjectScoped("company tax jurisdictions")
  @Post("tax/jurisdictions/:id/rates")
  addRate(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body(new ZodValidationPipe(createTaxRateSchema)) body: CreateTaxRateInput) {
    return this.service.addRate(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get("tax/liability-report")
  taxLiabilityReport(
    @CurrentUser() user: AuthUser,
    @Query("jurisdictionId") jurisdictionId: string,
    @Query("periodStart") periodStart: string,
    @Query("periodEnd") periodEnd: string,
  ) {
    return this.service.taxLiabilityReport(user.companyId, jurisdictionId, new Date(periodStart), new Date(periodEnd));
  }

  @NotProjectScoped("`:id` is a client")
  @Get("clients/:id/tax-exemption-certificates")
  listExemptionCertificates(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listExemptionCertificates(user.companyId, id);
  }

  @NotProjectScoped("`:id` is a client")
  @Post("clients/:id/tax-exemption-certificates")
  addExemptionCertificate(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createTaxExemptionCertificateSchema)) body: CreateTaxExemptionCertificateInput,
  ) {
    return this.service.addExemptionCertificate(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @NotProjectScoped("`:id` is a client")
  @Patch("clients/:id/tax-jurisdiction")
  setClientJurisdiction(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setClientTaxJurisdictionSchema)) body: SetClientTaxJurisdictionInput,
  ) {
    return this.service.setClientJurisdiction(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @ProjectResource("Invoice")
  @Post("invoices/:id/recalculate-tax")
  recalculateInvoiceTax(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.recalculateInvoiceTax(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
