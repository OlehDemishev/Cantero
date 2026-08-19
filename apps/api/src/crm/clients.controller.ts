import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createClientSchema,
  updateClientSchema,
  type AuthUser,
  type CreateClientInput,
  type UpdateClientInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ClientsService } from "./clients.service";

@Controller("clients")
export class ClientsController {
  constructor(private readonly service: ClientsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createClientSchema)) body: CreateClientInput,
  ) {
    return this.service.create(user.companyId, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateClientSchema)) body: UpdateClientInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }
}
