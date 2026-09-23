import { Global, Module } from "@nestjs/common";
import { PermissionsService } from "./permissions.service";
import { SelfScopeService } from "./self-scope.service";

@Global()
@Module({
  providers: [PermissionsService, SelfScopeService],
  exports: [PermissionsService, SelfScopeService],
})
export class PermissionsModule {}
