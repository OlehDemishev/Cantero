import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { submitNpsSurveySchema, type AuthUser, type SubmitNpsSurveyInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { NpsSurveysService } from "./nps-surveys.service";

@Controller()
export class NpsSurveysController {
  constructor(private readonly service: NpsSurveysService) {}

  @Post("projects/:id/nps-survey")
  send(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.send(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Get("nps-surveys/trend")
  trend(@CurrentUser() user: AuthUser) {
    return this.service.trend(user.companyId);
  }

  @Public()
  @Post("nps-surveys/:token")
  submit(@Param("token") token: string, @Body(new ZodValidationPipe(submitNpsSurveySchema)) body: SubmitNpsSurveyInput) {
    return this.service.submit(token, body);
  }
}
