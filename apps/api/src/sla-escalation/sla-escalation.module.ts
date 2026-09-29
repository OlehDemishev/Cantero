import { Module } from "@nestjs/common";
import { SlaEscalationService } from "./sla-escalation.service";
import { SlaEscalationProcessor } from "./sla-escalation.processor";
import { backgroundProviders } from "../common/queue/process-role";

@Module({
  providers: [SlaEscalationService, ...backgroundProviders(SlaEscalationProcessor)],
})
export class SlaEscalationModule {}
