import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  addCommissioningChecklistItemSchema,
  addFunctionalTestSchema,
  createCommissioningSystemSchema,
  scheduleOwnerTrainingSchema,
  signOffOwnerTrainingSchema,
  type AddCommissioningChecklistItemInput,
  type AddFunctionalTestInput,
  type AuthUser,
  type CreateCommissioningSystemInput,
  type ScheduleOwnerTrainingInput,
  type SignOffOwnerTrainingInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CommissioningService } from "./commissioning.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";

@Requires("site.manage")
@Controller()
export class CommissioningController {
  constructor(private readonly service: CommissioningService) {}

  @Get("projects/:id/commissioning-systems")
  list(@CurrentUser() user: AuthUser, @Param("id") projectId: string) {
    return this.service.listForProject(user.companyId, projectId);
  }

  @Post("projects/:id/commissioning-systems")
  create(
    @CurrentUser() user: AuthUser,
    @Param("id") projectId: string,
    @Body(new ZodValidationPipe(createCommissioningSystemSchema)) body: CreateCommissioningSystemInput,
  ) {
    return this.service.createSystem(user.companyId, { userId: user.userId, name: user.name }, projectId, body);
  }

  @ProjectResource("CommissioningSystem")
  @Post("commissioning-systems/:id/checklist-items")
  addChecklistItem(
    @CurrentUser() user: AuthUser,
    @Param("id") systemId: string,
    @Body(new ZodValidationPipe(addCommissioningChecklistItemSchema)) body: AddCommissioningChecklistItemInput,
  ) {
    return this.service.addChecklistItem(user.companyId, systemId, body);
  }

  @ProjectResource("CommissioningChecklistItem")
  @Post("commissioning-checklist-items/:id/toggle")
  toggleChecklistItem(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.toggleChecklistItem(user.companyId, id, user.name);
  }

  @ProjectResource("CommissioningSystem")
  @Post("commissioning-systems/:id/functional-tests")
  addFunctionalTest(
    @CurrentUser() user: AuthUser,
    @Param("id") systemId: string,
    @Body(new ZodValidationPipe(addFunctionalTestSchema)) body: AddFunctionalTestInput,
  ) {
    return this.service.addFunctionalTest(user.companyId, { userId: user.userId, name: user.name }, systemId, body);
  }

  @ProjectResource("CommissioningSystem")
  @Post("commissioning-systems/:id/training-sessions")
  scheduleOwnerTraining(
    @CurrentUser() user: AuthUser,
    @Param("id") systemId: string,
    @Body(new ZodValidationPipe(scheduleOwnerTrainingSchema)) body: ScheduleOwnerTrainingInput,
  ) {
    return this.service.scheduleOwnerTraining(user.companyId, { userId: user.userId, name: user.name }, systemId, body);
  }

  @ProjectResource("OwnerTrainingSession")
  @Post("owner-training-sessions/:id/sign-off")
  signOffOwnerTraining(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(signOffOwnerTrainingSchema)) body: SignOffOwnerTrainingInput,
  ) {
    return this.service.signOffOwnerTraining(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
