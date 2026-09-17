import { Controller, Get, Header, Query, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { GobdLedgerService } from "../common/gobd/gobd-ledger.service";
import { GobdService } from "./gobd.service";

const PAGE_SIZE = 100;

@Roles("owner", "admin", "accountant")
@Controller("company/gobd")
export class GobdController {
  constructor(
    private readonly gobdLedger: GobdLedgerService,
    private readonly gobd: GobdService,
  ) {}

  @Get("ledger")
  ledger(@CurrentUser() user: AuthUser, @Query("cursor") cursor?: string) {
    return this.gobdLedger.list(user.companyId, PAGE_SIZE, cursor);
  }

  @Get("verify")
  verify(@CurrentUser() user: AuthUser) {
    return this.gobdLedger.verifyChain(user.companyId);
  }

  @Get("verfahrensdokumentation.pdf")
  @Header("Content-Type", "application/pdf")
  async verfahrensdokumentation(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const pdf = await this.gobd.generateVerfahrensdokumentation(user.companyId);
    res.set("Content-Disposition", 'attachment; filename="Verfahrensdokumentation-GoBD.pdf"');
    return new StreamableFile(pdf);
  }
}
