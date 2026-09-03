import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  addInterviewSchema,
  convertCandidateToWorkerSchema,
  createCandidateSchema,
  createJobPostingSchema,
  moveCandidateStageSchema,
  updateJobPostingSchema,
  type AddInterviewInput,
  type AuthUser,
  type ConvertCandidateToWorkerInput,
  type CreateCandidateInput,
  type CreateJobPostingInput,
  type MoveCandidateStageInput,
  type UpdateJobPostingInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { RecruitingService } from "./recruiting.service";

@Controller("recruiting")
export class RecruitingController {
  constructor(private readonly service: RecruitingService) {}

  @Get("job-postings")
  listJobPostings(@CurrentUser() user: AuthUser) {
    return this.service.listJobPostings(user.companyId);
  }

  @Post("job-postings")
  createJobPosting(@CurrentUser() user: AuthUser, @Body(new ZodValidationPipe(createJobPostingSchema)) body: CreateJobPostingInput) {
    return this.service.createJobPosting(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Patch("job-postings/:id")
  updateJobPosting(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateJobPostingSchema)) body: UpdateJobPostingInput,
  ) {
    return this.service.updateJobPosting(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get("job-postings/:id/candidates")
  listCandidates(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.listCandidates(user.companyId, id);
  }

  @Post("job-postings/:id/candidates")
  createCandidate(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createCandidateSchema)) body: CreateCandidateInput,
  ) {
    return this.service.createCandidate(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get("candidates/:id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Post("candidates/:id/stage")
  moveStage(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(moveCandidateStageSchema)) body: MoveCandidateStageInput,
  ) {
    return this.service.moveStage(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post("candidates/:id/interviews")
  addInterview(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addInterviewSchema)) body: AddInterviewInput,
  ) {
    return this.service.addInterview(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Post("candidates/:id/convert-to-worker")
  convertToWorker(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(convertCandidateToWorkerSchema)) body: ConvertCandidateToWorkerInput,
  ) {
    return this.service.convertToWorker(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }
}
