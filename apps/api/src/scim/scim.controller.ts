import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { scimCreateUserSchema, scimPatchUserSchema, type ScimCreateUserInput, type ScimPatchUserInput } from "@cantero/shared";
import { Public } from "../common/decorators/public.decorator";
import { ApiKeyCompanyId } from "../common/decorators/api-key-company.decorator";
import { ApiKeyGuard } from "../common/guards/api-key.guard";
import { RequireScope } from "../common/decorators/require-scope.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ScimService } from "./scim.service";

/** Authenticated the same way as /v1/* (X-Api-Key), but only with a key that names the "scim"
 * scope — an unscoped key (every read dataset) doesn't reach it, since SCIM creates users and
 * signs them out. See ScimService for what's actually implemented vs. stubbed. */
@Public()
@RequireScope("scim")
@UseGuards(ApiKeyGuard)
@Controller("scim/v2/Users")
export class ScimController {
  constructor(private readonly service: ScimService) {}

  @Get()
  list(@ApiKeyCompanyId() companyId: string) {
    return this.service.listUsers(companyId);
  }

  @Post()
  create(@ApiKeyCompanyId() companyId: string, @Body(new ZodValidationPipe(scimCreateUserSchema)) body: ScimCreateUserInput) {
    return this.service.createUser(companyId, body);
  }

  @Patch(":id")
  patch(
    @ApiKeyCompanyId() companyId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(scimPatchUserSchema)) body: ScimPatchUserInput,
  ) {
    return this.service.patchUser(companyId, id, body);
  }
}
