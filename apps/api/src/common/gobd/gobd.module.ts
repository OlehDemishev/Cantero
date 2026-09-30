import { Global, Module } from "@nestjs/common";
import { GobdLedgerService } from "./gobd-ledger.service";
import { GobdAnchorService } from "./gobd-anchor.service";
import { GobdAnchorProcessor } from "./gobd-anchor.processor";
import { backgroundProviders } from "../queue/process-role";

@Global()
@Module({
  providers: [GobdLedgerService, GobdAnchorService, ...backgroundProviders(GobdAnchorProcessor)],
  exports: [GobdLedgerService, GobdAnchorService],
})
export class GobdModule {}
