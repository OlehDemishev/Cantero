import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { submitEnpsSurveySchema, type AuthUser, type SubmitEnpsSurveyInput } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { EnpsSurveysService } from "./enps-surveys.service";

@Controller("enps-surveys")
export class EnpsSurveysController {
  constructor(private readonly service: EnpsSurveysService) {}

  @Post("send-now")
  sendNow(@CurrentUser() user: AuthUser) {
    return this.service.sendNow(user.companyId, { userId: user.userId, name: user.name });
  }

  @Get("trend")
  trend(@CurrentUser() user: AuthUser) {
    return this.service.trend(user.companyId);
  }

  @Get("trend-by-period")
  trendByPeriod(@CurrentUser() user: AuthUser) {
    return this.service.trendByPeriod(user.companyId);
  }

  @Public()
  @Post(":token")
  submit(@Param("token") token: string, @Body(new ZodValidationPipe(submitEnpsSurveySchema)) body: SubmitEnpsSurveyInput) {
    return this.service.submit(token, body);
  }
}
