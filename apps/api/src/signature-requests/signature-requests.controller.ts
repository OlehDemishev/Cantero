import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createSignatureRequestSchema, type AuthUser, type CreateSignatureRequestInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { SignatureRequestsService } from "./signature-requests.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { RequiresFor } from "../common/decorators/permissions.decorator";

@ProjectResource("SignatureRequest")
@RequiresFor("contracts.view", "contracts.manage")
@Controller("signature-requests")
export class SignatureRequestsController {
  constructor(private readonly service: SignatureRequestsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createSignatureRequestSchema)) body: CreateSignatureRequestInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Post(":id/send")
  send(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.send(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/void")
  void(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.void(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
