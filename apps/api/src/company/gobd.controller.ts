import { Controller, Get, Header, Param, Post, Query, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import type { AuthUser } from "@cantero/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { GobdLedgerService } from "../common/gobd/gobd-ledger.service";
import { GobdAnchorService } from "../common/gobd/gobd-anchor.service";
import { GobdService } from "./gobd.service";
import { RequiresFor } from "../common/decorators/permissions.decorator";

const PAGE_SIZE = 100;

// Reading the ledger and its timestamps is an export; asking for a timestamp now is a change.
@RequiresFor("finance.export", "finance.manage")
@Controller("company/gobd")
export class GobdController {
  constructor(
    private readonly gobdLedger: GobdLedgerService,
    private readonly gobd: GobdService,
    private readonly anchors: GobdAnchorService,
  ) {}

  @Get("ledger")
  ledger(@CurrentUser() user: AuthUser, @Query("cursor") cursor?: string) {
    return this.gobdLedger.list(user.companyId, PAGE_SIZE, cursor);
  }

  /** The hash chain recomputed from the entries, plus every outside timestamp of it: valid only
   * when both hold. */
  @Get("verify")
  async verify(@CurrentUser() user: AuthUser) {
    const [chain, anchoring] = await Promise.all([this.gobdLedger.verifyChain(user.companyId), this.anchors.verify(user.companyId)]);
    return { ...chain, valid: chain.valid && anchoring.valid, chainValid: chain.valid, anchoring, anchoringEnabled: Boolean(this.anchors.tsaUrl) };
  }

  /** Whether this server timestamps the ledger at all, and the timestamps so far (newest first). */
  @Get("anchors")
  async anchorList(@CurrentUser() user: AuthUser) {
    return { enabled: Boolean(this.anchors.tsaUrl), anchors: await this.anchors.list(user.companyId) };
  }

  /** Timestamps the ledger's current head right away instead of waiting for the daily run.
   * `anchor` is null when the head was already timestamped. */
  @Post("anchors")
  async anchorNow(@CurrentUser() user: AuthUser) {
    return { anchor: await this.anchors.anchor(user.companyId) };
  }

  /** The RFC 3161 token itself. The timestamped data is the 32 bytes of the entry's hash:
   * `echo <hash> | xxd -r -p > head.bin && openssl ts -verify -data head.bin -in <file> -token_in -CAfile <roots>`. */
  @Get("anchors/:id/token.tsr")
  @Header("Content-Type", "application/timestamp-reply")
  async anchorToken(@CurrentUser() user: AuthUser, @Param("id") id: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const { token, sequence } = await this.anchors.token(user.companyId, id);
    res.set("Content-Disposition", `attachment; filename="gobd-ledger-${sequence}.tsr"`);
    return new StreamableFile(token);
  }

  @Get("verfahrensdokumentation.pdf")
  @Header("Content-Type", "application/pdf")
  async verfahrensdokumentation(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const pdf = await this.gobd.generateVerfahrensdokumentation(user.companyId);
    res.set("Content-Disposition", 'attachment; filename="Verfahrensdokumentation-GoBD.pdf"');
    return new StreamableFile(pdf);
  }
}
