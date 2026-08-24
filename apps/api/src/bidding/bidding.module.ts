import { Module } from "@nestjs/common";
import { BidRequestsController } from "./bid-requests.controller";
import { BidRequestsService } from "./bid-requests.service";
import { FinanceModule } from "../finance/finance.module";

@Module({
  imports: [FinanceModule],
  controllers: [BidRequestsController],
  providers: [BidRequestsService],
  exports: [BidRequestsService],
})
export class BiddingModule {}
