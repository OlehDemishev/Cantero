import { Module } from "@nestjs/common";
import { SsoController } from "./sso.controller";
import { SsoService } from "./sso.service";

@Module({
  controllers: [SsoController],
  providers: [SsoService],
})
export class SsoModule {}
