import { BadRequestException, Body, Controller, Delete, Get, Header, Param, Post, Put, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import {
  createBidRequestSchema,
  addBidScoreCriterionSchema,
  scoreBidSchema,
  setBidRequestLinesSchema,
  type AuthUser,
  type CreateBidRequestInput,
  type AddBidScoreCriterionInput,
  type ScoreBidInput,
  type SetBidRequestLinesInput,
} from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { MAX_UPLOAD_BYTES } from "../common/upload-limits";
import { BidRequestsService } from "./bid-requests.service";
import { ProjectResource } from "../common/project-access/project-resource.decorator";

@ProjectResource("BidRequest")
@Controller("bid-requests")
export class BidRequestsController {
  constructor(private readonly service: BidRequestsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query("projectId") projectId?: string) {
    return this.service.list(user.companyId, projectId);
  }

  @Get(":id")
  get(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.get(user.companyId, id);
  }

  @Get(":id/leveling")
  leveling(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.leveling(user.companyId, id);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createBidRequestSchema)) body: CreateBidRequestInput,
  ) {
    return this.service.create(user.companyId, { userId: user.userId, name: user.name }, body);
  }

  @Post(":id/award/:bidId")
  award(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("bidId") bidId: string) {
    return this.service.award(user.companyId, { userId: user.userId, name: user.name }, id, bidId);
  }

  @Post(":id/cancel")
  cancel(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.service.cancel(user.companyId, { userId: user.userId, name: user.name }, id);
  }

  @Post(":id/criteria")
  addCriterion(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addBidScoreCriterionSchema)) body: AddBidScoreCriterionInput,
  ) {
    return this.service.addCriterion(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Delete(":id/criteria/:criterionId")
  removeCriterion(@CurrentUser() user: AuthUser, @Param("id") id: string, @Param("criterionId") criterionId: string) {
    return this.service.removeCriterion(user.companyId, { userId: user.userId, name: user.name }, id, criterionId);
  }

  @Put(":id/lines")
  setLines(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setBidRequestLinesSchema)) body: SetBidRequestLinesInput,
  ) {
    return this.service.setLines(user.companyId, { userId: user.userId, name: user.name }, id, body);
  }

  @Get(":id/gaeb-da83.xml")
  @Header("Content-Type", "application/xml")
  async gaebDa83Xml(@CurrentUser() user: AuthUser, @Param("id") id: string, @Res({ passthrough: true }) res: Response) {
    const { xml, filename } = await this.service.generateGaebDa83Xml(user.companyId, id);
    res.set("Content-Disposition", `attachment; filename="${filename}"`);
    return xml;
  }

  @Post(":id/gaeb-da84/:subcontractorId")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  importGaebDa84(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("subcontractorId") subcontractorId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException("No file provided");
    return this.service.importGaebDa84Bid(user.companyId, { userId: user.userId, name: user.name }, id, subcontractorId, file.buffer.toString("utf-8"));
  }

  @Post(":id/bids/:bidId/score")
  scoreBid(
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Param("bidId") bidId: string,
    @Body(new ZodValidationPipe(scoreBidSchema)) body: ScoreBidInput,
  ) {
    return this.service.scoreBid(user.companyId, { userId: user.userId, name: user.name }, id, bidId, body);
  }
}
