import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  addCylinderBreakSchema,
  addSlumpTestSchema,
  createConcretePourSchema,
  recordCylinderBreakResultSchema,
  type AddCylinderBreakInput,
  type AddSlumpTestInput,
  type AuthUser,
  type CreateConcretePourInput,
  type RecordCylinderBreakResultInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ConcreteQcService } from "./concrete-qc.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";

@Controller()
export class ConcreteQcController {
  constructor(private readonly service: ConcreteQcService) {}

  @Get("projects/:id/concrete-pours")
  list(@CurrentUser() user: AuthUser, @Param("id") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Post("projects/:id/concrete-pours")
  create(
    @CurrentUser() user: AuthUser,
    @Param("id") projectId: string,
    @Body(new ZodValidationPipe(createConcretePourSchema)) body: CreateConcretePourInput,
  ) {
    return this.service.createPour(user.companyId, { userId: user.userId, name: user.name }, projectId, body);
  }

  @ProjectResource("ConcretePour")
  @Post("concrete-pours/:id/slump-tests")
  addSlumpTest(
    @CurrentUser() user: AuthUser,
    @Param("id") pourId: string,
    @Body(new ZodValidationPipe(addSlumpTestSchema)) body: AddSlumpTestInput,
  ) {
    return this.service.addSlumpTest(user.companyId, pourId, body);
  }

  @ProjectResource("ConcretePour")
  @Post("concrete-pours/:id/cylinder-breaks")
  addCylinderBreak(
    @CurrentUser() user: AuthUser,
    @Param("id") pourId: string,
    @Body(new ZodValidationPipe(addCylinderBreakSchema)) body: AddCylinderBreakInput,
  ) {
    return this.service.addCylinderBreak(user.companyId, pourId, body);
  }

  @ProjectResource("CylinderBreak")
  @Post("cylinder-breaks/:id/result")
  recordResult(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(recordCylinderBreakResultSchema)) body: RecordCylinderBreakResultInput,
  ) {
    return this.service.recordCylinderBreakResult(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
