import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import {
  addWorkerCertificationSchema,
  createWorkerSchema,
  updateWorkerSchema,
  type AddWorkerCertificationInput,
  type AuthUser,
  type CreateWorkerInput,
  type UpdateWorkerInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { WorkersService } from "./workers.service";

@Controller("workers")
export class WorkersController {
  constructor(private readonly service: WorkersService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.service.list(user.companyId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Get(":id/summary")
  summary(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.summary(user.companyId, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createWorkerSchema)) body: CreateWorkerInput) {
    return this.service.create(user.companyId, body);
  }

  @Roles("owner", "admin")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateWorkerSchema)) body: UpdateWorkerInput,
  ) {
    return this.service.update(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get(":id/certifications")
  listCertifications(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listCertifications(user.companyId, id);
  }

  @Post(":id/certifications")
  addCertification(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addWorkerCertificationSchema)) body: AddWorkerCertificationInput,
  ) {
    return this.service.addCertification(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Delete(":id/certifications/:certificationId")
  removeCertification(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("certificationId") certificationId: string,
  ) {
    return this.service.deleteCertification(user.companyId, id, certificationId);
  }
}
