import { Module } from "@nestjs/common";
import { LeadFollowUpService } from "./lead-follow-up.service";
import { LeadFollowUpProcessor } from "./lead-follow-up.processor";

@Module({
  providers: [LeadFollowUpService, LeadFollowUpProcessor],
})
export class LeadFollowUpModule {}
