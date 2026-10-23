import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Columns no query returns unless it asks for them by name (`omit: { column: false }`) — a secret
 * that a plain `include: { worker: true }` somewhere would otherwise send to the browser.
 *
 * The access tokens are bearer credentials for an outside party (the client signing an estimate,
 * change order or contract; a signature request's signer): whoever holds one can sign in their
 * name. Staff list/get responses must never carry them — the email that delivers the link and the
 * manage-only "client link" endpoints ask for them explicitly.
 *
 * A subcontractor's publicToken is the link to their public reference page: whoever has it can
 * share the page, so only staff who can turn that page on/off get it (GET …/:id/public-link).
 */
export const GLOBAL_OMIT = {
  worker: { clockInPinHash: true },
  estimate: { clientAccessToken: true },
  changeOrder: { clientAccessToken: true },
  contract: { clientAccessToken: true },
  signatureRequestSigner: { accessToken: true },
  subcontractor: { publicToken: true },
} as const;

@Injectable()
export class PrismaService extends PrismaClient<{ omit: typeof GLOBAL_OMIT }> implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ omit: GLOBAL_OMIT });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
