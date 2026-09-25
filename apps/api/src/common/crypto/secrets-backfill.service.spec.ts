import { SecretsBackfillService } from "./secrets-backfill.service";
import { decryptSecret, encryptSecret, isEncryptedWithCurrentKey } from "./secret-box";

/** A tiny in-memory stand-in for one Prisma delegate, honouring just the filters the backfill uses. */
function fakeDelegate(rows: Record<string, string | null>[]) {
  return {
    rows,
    findMany: jest.fn(async ({ where, take }: { where: Record<string, unknown>; take: number }) => {
      const field = Object.keys(where).find((k) => k !== "NOT" && k !== "id")!;
      const prefix = ((where.NOT as Record<string, { startsWith: string }>)[field]).startsWith;
      const excluded = (where.id as { notIn?: string[] } | undefined)?.notIn ?? [];
      return rows.filter((r) => r[field] != null && r[field] !== "" && !r[field]!.startsWith(prefix) && !excluded.includes(r.id!)).slice(0, take);
    }),
    updateMany: jest.fn(async ({ where, data }: { where: Record<string, string>; data: Record<string, string> }) => {
      const [field] = Object.keys(data);
      const row = rows.find((r) => r.id === where.id && r[field] === where[field]);
      if (!row) return { count: 0 };
      row[field] = data[field];
      return { count: 1 };
    }),
  };
}

describe("SecretsBackfillService", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  function serviceWith(delegates: Record<string, ReturnType<typeof fakeDelegate>>) {
    const prisma = new Proxy({}, { get: (_t, model: string) => delegates[model] ?? fakeDelegate([]) });
    return new SecretsBackfillService(prisma as never);
  }

  it("encrypts plaintext rows written before encryption, and leaves empty/null ones alone", async () => {
    const users = fakeDelegate([
      { id: "u1", totpSecret: "JBSWY3DPEHPK3PXP", pendingTotpSecret: null },
      { id: "u2", totpSecret: null, pendingTotpSecret: null },
    ]);
    const accounting = fakeDelegate([{ id: "c1", accessToken: "lexoffice-key", refreshToken: "" }]);

    const rewritten = await serviceWith({ user: users, accountingConnection: accounting }).run();

    expect(rewritten).toBe(2);
    expect(isEncryptedWithCurrentKey(users.rows[0].totpSecret!)).toBe(true);
    expect(decryptSecret(users.rows[0].totpSecret!)).toBe("JBSWY3DPEHPK3PXP");
    expect(users.rows[1].totpSecret).toBeNull();
    expect(accounting.rows[0].refreshToken).toBe("");
    expect(decryptSecret(accounting.rows[0].accessToken!)).toBe("lexoffice-key");
  });

  it("re-encrypts rows still under the previous key after a rotation", async () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    const old = encryptSecret("whsec");
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString("base64");
    process.env.DATA_ENCRYPTION_KEY_PREVIOUS = Buffer.alloc(32, 1).toString("base64");
    const webhooks = fakeDelegate([{ id: "w1", secret: old }]);

    await serviceWith({ webhookEndpoint: webhooks }).run();

    expect(isEncryptedWithCurrentKey(webhooks.rows[0].secret!)).toBe(true);
    expect(decryptSecret(webhooks.rows[0].secret!)).toBe("whsec");
  });

  it("gives up on a row under a key that's no longer configured instead of looping", async () => {
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
    const lost = encryptSecret("gone");
    process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 2).toString("base64");
    const webhooks = fakeDelegate([{ id: "w1", secret: lost }]);

    await expect(serviceWith({ webhookEndpoint: webhooks }).run()).resolves.toBe(0);
    expect(webhooks.rows[0].secret).toBe(lost);
  });
});
