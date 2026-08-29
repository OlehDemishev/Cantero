import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import {
  acknowledgeJhaSchema,
  createJhaSchema,
  type AcknowledgeJhaInput,
  type AuthUser,
  type CreateJhaInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { JhaService } from "./jha.service";

@Controller("safety/jha")
export class JhaController {
  constructor(private readonly service: JhaService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createJhaSchema)) body: CreateJhaInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Post(":id/acknowledge")
  acknowledge(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(acknowledgeJhaSchema)) body: AcknowledgeJhaInput,
  ) {
    return this.service.acknowledge(user.companyId, id, body);
  }
}
