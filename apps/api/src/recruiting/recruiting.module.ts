import { Module } from "@nestjs/common";
import { RecruitingController } from "./recruiting.controller";
import { RecruitingService } from "./recruiting.service";
import { TeamModule } from "../team/team.module";

@Module({
  imports: [TeamModule],
  controllers: [RecruitingController],
  providers: [RecruitingService],
})
export class RecruitingModule {}
