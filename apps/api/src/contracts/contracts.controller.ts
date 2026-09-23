import { Body, Controller, Get, Header, Param, Post, Query, StreamableFile } from "@nestjs/common";
import {
  createContractSchema,
  updateContractBodySchema,
  type AuthUser,
  type CreateContractInput,
  type UpdateContractBodyInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ContractsService } from "./contracts.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { RequiresFor } from "../common/decorators/permissions.decorator";

@ProjectResource("Contract")
@RequiresFor("contracts.view", "contracts.manage")
@Controller("contracts")
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId?: string) {
    return this.service.list(user.companyId, projectId, user);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createContractSchema)) body: CreateContractInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Post(":id/body")
  updateBody(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateContractBodySchema)) body: UpdateContractBodyInput,
  ) {
    return this.service.updateBody(user.companyId, id, body.body);
  }

  @Post(":id/send")
  send(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.send(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/send-docusign")
  sendViaDocusign(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.sendViaDocusign(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/docusign-refresh")
  refreshDocusignStatus(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.refreshDocusignStatus(user.companyId, id);
  }

  @Get(":id/docusign-signed-pdf")
  @Header("Content-Type", "application/pdf")
  async getDocusignSignedPdf(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.service.getDocusignSignedPdf(user.companyId, id);
    return new StreamableFile(buffer, { disposition: `attachment; filename="contract-signed-docusign.pdf"` });
  }

  @Post(":id/void")
  void_(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.void(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Get(":id/signature")
  @Header("Content-Type", "image/png")
  async getSignature(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.service.getSignature(user.companyId, id);
    return new StreamableFile(buffer);
  }

  @Get(":id/pdf")
  @Header("Content-Type", "application/pdf")
  async getPdf(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const buffer = await this.service.generatePdf(user.companyId, id);
    return new StreamableFile(buffer, { disposition: `attachment; filename="contract.pdf"` });
  }
}
