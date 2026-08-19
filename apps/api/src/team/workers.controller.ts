import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  createWorkerSchema,
  updateWorkerSchema,
  type AuthUser,
  type CreateWorkerInput,
  type UpdateWorkerInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { WorkersService } from "./workers.service";

@Controller("workers")
export class WorkersController {
  constructor(private readonly service: WorkersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Get(":id/summary")
  summary(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.summary(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createWorkerSchema)) body: CreateWorkerInput) {
    return this.service.create(user.companyId, body);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateWorkerSchema)) body: UpdateWorkerInput,
  ) {
    return this.service.update(user.companyId, id, body);
  }
}
