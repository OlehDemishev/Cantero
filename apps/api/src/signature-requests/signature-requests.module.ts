import { Module } from "@nestjs/common";
import { SignatureRequestsController } from "./signature-requests.controller";
import { PublicSignatureRequestsController } from "./public-signature-requests.controller";
import { SignatureRequestsService } from "./signature-requests.service";

@Module({
  controllers: [SignatureRequestsController, PublicSignatureRequestsController],
  providers: [SignatureRequestsService],
})
export class SignatureRequestsModule {}
