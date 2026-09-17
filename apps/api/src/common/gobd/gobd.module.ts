import { Global, Module } from "@nestjs/common";
import { GobdLedgerService } from "./gobd-ledger.service";

@Global()
@Module({
  providers: [GobdLedgerService],
  exports: [GobdLedgerService],
})
export class GobdModule {}
