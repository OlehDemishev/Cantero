import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { logCalibrationSchema, type AuthUser, type LogCalibrationInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CalibrationService } from "./calibration.service";
import { OpenToAllRoles } from "../common/decorators/roles.decorator";
import { Requires } from "../common/decorators/permissions.decorator";
import { OptionalIntPipe } from "../common/pipes/query-pipes";

@Requires("site.manage")
@Controller("calibration-records")
export class CalibrationController {
  constructor(private readonly service: CalibrationService) {}

  @Get()
  history(@CurrentUser() user: AuthUser, @Query("toolCribItemId") toolCribItemId?: string, @Query("equipmentId") equipmentId?: string) {
    return this.service.history(user.companyId, toolCribItemId, equipmentId);
  }

  @Get("due")
  dueList(@CurrentUser() user: AuthUser, @Query("days", OptionalIntPipe) days?: number) {
    return this.service.dueList(user.companyId, days);
  }

  @Post()
  log(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(logCalibrationSchema)) body: LogCalibrationInput) {
    return this.service.log(user.companyId, { userId: user.userId, name: user.name }, body);
  }
}
