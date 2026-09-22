import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  createMaterialRfqSchema,
  submitMaterialRfqQuoteSchema,
  type AuthUser,
  type CreateMaterialRfqInput,
  type SubmitMaterialRfqQuoteInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { MaterialRfqsService } from "./material-rfqs.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";

@ProjectResource("MaterialRfq")
@Controller("materials/rfqs")
export class MaterialRfqsController {
  constructor(private readonly service: MaterialRfqsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createMaterialRfqSchema)) body: CreateMaterialRfqInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Post(":id/quotes")
  submitQuote(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(submitMaterialRfqQuoteSchema)) body: SubmitMaterialRfqQuoteInput,
  ) {
    return this.service.submitQuote(user.companyId, id, body);
  }

  @Post(":id/quotes/:quoteId/award")
  awardLine(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("quoteId") quoteId: string) {
    return this.service.awardLine(user.companyId, { userId: user.userId, name: user.name }, id, quoteId);
  }

  @Post(":id/close")
  close(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.close(user.companyId, { userId: user.userId, name: user.name }, id);
  }
}
