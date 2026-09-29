import { Module } from "@nestjs/common";
import { LeadFollowUpService } from "./lead-follow-up.service";
import { LeadFollowUpProcessor } from "./lead-follow-up.processor";
import { backgroundProviders } from "../common/queue/process-role";

@Module({
  providers: [LeadFollowUpService, ...backgroundProviders(LeadFollowUpProcessor)],
})
export class LeadFollowUpModule {}
