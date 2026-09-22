import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  addHrCaseActionSchema,
  openHrCaseSchema,
  updateHrCaseStatusSchema,
  type AddHrCaseActionInput,
  type AuthUser,
  type OpenHrCaseInput,
  type UpdateHrCaseStatusInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { HrCasesService } from "./hr-cases.service";
import { NotProjectScoped } from "../common/project-access/project-resource.decorator";

@NotProjectScoped("HR cases belong to workers, not projects")
@Controller()
export class HrCasesController {
  constructor(private readonly service: HrCasesService) {}

  @Get("hr-cases")
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get("hr-cases/:id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post("hr-cases/:id/status")
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateHrCaseStatusSchema)) body: UpdateHrCaseStatusInput,
  ) {
    return this.service.updateStatus(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post("hr-cases/:id/actions")
  addAction(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addHrCaseActionSchema)) body: AddHrCaseActionInput,
  ) {
    return this.service.addAction(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post("hr-case-actions/:actionId/acknowledge")
  acknowledgeAction(@CurrentUser() user: AuthUser, @Param("actionId") actionId: string) {
    return this.service.acknowledgeAction(user.companyId, { userId: user.userId, name: user.name }, actionId);
  }

  @Get("workers/:workerId/hr-cases")
  listForWorker(@CurrentUser() user: AuthUser, @Param("workerId") workerId: string) {
    return this.service.listForWorker(user.companyId, workerId);
  }

  @Post("workers/:workerId/hr-cases")
  openCase(
    @CurrentUser() user: AuthUser,
    @Param("workerId") workerId: string,
    @Body(new ZodValidationPipe(openHrCaseSchema)) body: OpenHrCaseInput,
  ) {
    return this.service.openCase(user.companyId, { userId: user.userId, name: user.name }, workerId, body);
  }
}
