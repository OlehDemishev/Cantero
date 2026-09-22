import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  checkInToolSchema,
  checkOutToolSchema,
  createToolCribItemSchema,
  registerToolCribUnitsSchema,
  type AuthUser,
  type CheckInToolInput,
  type CheckOutToolInput,
  type CreateToolCribItemInput,
  type RegisterToolCribUnitsInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ToolCribService } from "./tool-crib.service";
import { NotProjectScoped, ProjectResource } from "../common/project-access/project-resource.decorator";

@Controller()
export class ToolCribController {
  constructor(private readonly service: ToolCribService) {}

  @Get("tool-crib/items")
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Post("tool-crib/items")
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createToolCribItemSchema)) body: CreateToolCribItemInput) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Get("tool-crib/low-par-level")
  lowParLevelItems(@CurrentUser() user: AuthUser) {
    return this.service.lowParLevelItems(user.companyId);
  }

  @NotProjectScoped("company tool-crib items")
  @Post("tool-crib/items/:id/units")
  registerUnits(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(registerToolCribUnitsSchema)) body: RegisterToolCribUnitsInput,
  ) {
    return this.service.registerUnits(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @NotProjectScoped("company tool-crib items")
  @Get("tool-crib/items/:id/units")
  listUnits(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listUnits(user.companyId, id);
  }

  @NotProjectScoped("company tool-crib items; the project, if any, is in the body")
  @Post("tool-crib/items/:id/check-out")
  checkOut(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(checkOutToolSchema)) body: CheckOutToolInput,
  ) {
    return this.service.checkOut(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @ProjectResource("ToolCheckout")
  @Post("tool-checkouts/:id/check-in")
  checkIn(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(checkInToolSchema)) body: CheckInToolInput,
  ) {
    return this.service.checkIn(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @NotProjectScoped("workers are company-level")
  @Get("workers/:workerId/tool-checkouts")
  listCheckoutsForWorker(@CurrentUser() user: AuthUser, @Param("workerId") workerId: string) {
    return this.service.listCheckoutsForWorker(user.companyId, workerId);
  }

  @NotProjectScoped("workers are company-level")
  @Get("workers/:workerId/tool-liability")
  workerLiability(@CurrentUser() user: AuthUser, @Param("workerId") workerId: string) {
    return this.service.workerLiability(user.companyId, workerId);
  }
}
