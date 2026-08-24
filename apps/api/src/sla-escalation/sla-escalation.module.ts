import { Module } from "@nestjs/common";
import { SlaEscalationService } from "./sla-escalation.service";
import { SlaEscalationProcessor } from "./sla-escalation.processor";

@Module({
  providers: [SlaEscalationService, SlaEscalationProcessor],
})
export class SlaEscalationModule {}
