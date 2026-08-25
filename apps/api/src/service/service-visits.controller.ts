import { Body, Controller, Param, Post } from "@nestjs/common";
import {
  completeServiceVisitSchema,
  submitServiceVisitFeedbackSchema,
  type AuthUser,
  type CompleteServiceVisitInput,
  type SubmitServiceVisitFeedbackInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { ServiceVisitsService } from "./service-visits.service";

@Controller("service-visits")
export class ServiceVisitsController {
  constructor(private readonly service: ServiceVisitsService) {}

  @Post(":id/complete")
  complete(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(completeServiceVisitSchema)) body: CompleteServiceVisitInput,
  ) {
    return this.service.complete(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Public()
  @Post("feedback/:token")
  submitFeedback(
    @Param("token") token: string,
    @Body(new ZodValidationPipe(submitServiceVisitFeedbackSchema)) body: SubmitServiceVisitFeedbackInput,
  ) {
    return this.service.submitFeedback(token, body);
  }
}
