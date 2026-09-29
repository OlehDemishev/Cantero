import { assertProductionConfig, productionConfigWarnings } from "./production-config";

const KEY = Buffer.alloc(32, 7).toString("base64");
const secret = (n: number) => `${n}`.repeat(40);
const VALID = {
  NODE_ENV: "production",
  S3_BUCKET: "cantero-uploads",
  TRUST_PROXY_HOPS: "1",
  DATA_ENCRYPTION_KEY: KEY,
  DATABASE_URL: "postgresql://cantero:x@postgres:5432/cantero",
  REDIS_URL: "redis://redis:6379",
  WEB_ORIGIN: "https://app.cantero.example",
  API_ORIGIN: "https://api.cantero.example/api",
  SMTP_HOST: "smtp.mail.example",
  SMTP_FROM: "Cantero <no-reply@cantero.example>",
  JWT_SECRET: secret(1),
  PORTAL_JWT_SECRET: secret(2),
  SUBCONTRACTOR_PORTAL_JWT_SECRET: secret(3),
  SUPPLIER_PORTAL_JWT_SECRET: secret(4),
  STRIPE_SECRET_KEY: "sk_live_x",
  STRIPE_WEBHOOK_SECRET: "whsec_x",
  STRIPE_CONNECT_WEBHOOK_SECRET: "whsec_connect_x",
  VAPID_PUBLIC_KEY: "BPublicKey",
  VAPID_PRIVATE_KEY: "privateKey",
  VAPID_SUBJECT: "mailto:ops@cantero.example",
};

describe("assertProductionConfig", () => {
  it("accepts a complete production configuration", () => {
    expect(() => assertProductionConfig(VALID)).not.toThrow();
  });

  it("does nothing outside production", () => {
    expect(() => assertProductionConfig({ NODE_ENV: "development" })).not.toThrow();
    expect(() => assertProductionConfig({})).not.toThrow();
  });

  it("refuses local-disk uploads that would vanish with the container", () => {
    expect(() => assertProductionConfig({ ...VALID, S3_BUCKET: undefined })).toThrow(/S3_BUCKET/);
  });

  it("accepts local disk when UPLOADS_DIR deliberately points at a volume", () => {
    expect(() => assertProductionConfig({ ...VALID, S3_BUCKET: undefined, UPLOADS_DIR: "/data/uploads" })).not.toThrow();
  });

  it("requires TRUST_PROXY_HOPS to be stated, accepting an explicit 0", () => {
    expect(() => assertProductionConfig({ ...VALID, TRUST_PROXY_HOPS: undefined })).toThrow(/TRUST_PROXY_HOPS is unset/);
    expect(() => assertProductionConfig({ ...VALID, TRUST_PROXY_HOPS: " " })).toThrow(/TRUST_PROXY_HOPS is unset/);
    expect(() => assertProductionConfig({ ...VALID, TRUST_PROXY_HOPS: "0" })).not.toThrow();
  });

  it("rejects a TRUST_PROXY_HOPS that isn't a number of hops", () => {
    expect(() => assertProductionConfig({ ...VALID, TRUST_PROXY_HOPS: "true" })).toThrow(/whole number/);
  });

  it("requires a valid 32-byte DATA_ENCRYPTION_KEY", () => {
    expect(() => assertProductionConfig({ ...VALID, DATA_ENCRYPTION_KEY: undefined })).toThrow(/DATA_ENCRYPTION_KEY is unset/);
    expect(() => assertProductionConfig({ ...VALID, DATA_ENCRYPTION_KEY: "too-short" })).toThrow(/DATA_ENCRYPTION_KEY must be 32 random bytes/);
    expect(() => assertProductionConfig({ ...VALID, DATA_ENCRYPTION_KEY_PREVIOUS: "bad" })).toThrow(/DATA_ENCRYPTION_KEY_PREVIOUS must be 32/);
    expect(() => assertProductionConfig({ ...VALID, DATA_ENCRYPTION_KEY_PREVIOUS: Buffer.alloc(32, 1).toString("base64") })).not.toThrow();
  });

  it("lists every problem at once", () => {
    expect(() => assertProductionConfig({ NODE_ENV: "production" })).toThrow(/S3_BUCKET[\s\S]*TRUST_PROXY_HOPS/);
  });

  it("requires the public addresses, and refuses local ones", () => {
    expect(() => assertProductionConfig({ ...VALID, WEB_ORIGIN: undefined })).toThrow(/WEB_ORIGIN is unset/);
    expect(() => assertProductionConfig({ ...VALID, WEB_ORIGIN: "http://localhost:3000" })).toThrow(/must be the public https/);
    expect(() => assertProductionConfig({ ...VALID, API_ORIGIN: "http://api.cantero.example/api" })).toThrow(/API_ORIGIN.*must be the public https/);
  });

  it("requires email, the database, Redis and Stripe", () => {
    expect(() => assertProductionConfig({ ...VALID, SMTP_HOST: undefined })).toThrow(/SMTP_HOST is unset/);
    expect(() => assertProductionConfig({ ...VALID, DATABASE_URL: "" })).toThrow(/DATABASE_URL is unset/);
    expect(() => assertProductionConfig({ ...VALID, REDIS_URL: undefined })).toThrow(/REDIS_URL is unset/);
    expect(() => assertProductionConfig({ ...VALID, STRIPE_WEBHOOK_SECRET: undefined })).toThrow(/STRIPE_WEBHOOK_SECRET is unset/);
    expect(() => assertProductionConfig({ ...VALID, VAPID_PRIVATE_KEY: undefined })).toThrow(/VAPID_PRIVATE_KEY is unset/);
  });

  it("requires a strong, separate signing secret for staff and each portal", () => {
    expect(() => assertProductionConfig({ ...VALID, PORTAL_JWT_SECRET: undefined })).toThrow(/PORTAL_JWT_SECRET is unset/);
    expect(() => assertProductionConfig({ ...VALID, JWT_SECRET: "short" })).toThrow(/JWT_SECRET is too short/);
    expect(() => assertProductionConfig({ ...VALID, JWT_SECRET: "dev-only-change-me-but-long-enough-to-pass-length" })).toThrow(/placeholder/);
    expect(() => assertProductionConfig({ ...VALID, SUPPLIER_PORTAL_JWT_SECRET: VALID.JWT_SECRET })).toThrow(/SUPPLIER_PORTAL_JWT_SECRET is the same as JWT_SECRET/);
  });

  it("lists every problem at once", () => {
    expect(() => assertProductionConfig({ NODE_ENV: "production" })).toThrow(/S3_BUCKET[\s\S]*TRUST_PROXY_HOPS[\s\S]*SMTP_HOST[\s\S]*JWT_SECRET[\s\S]*STRIPE_SECRET_KEY/);
  });

  it("warns, without refusing, about test Stripe keys, unrecorded client payments and missing error reporting", () => {
    expect(productionConfigWarnings({ ...VALID, STRIPE_SECRET_KEY: "sk_test_x", SENTRY_DSN: "https://x@sentry.example/1" })).toEqual([
      "STRIPE_SECRET_KEY is a test key: no real payments will be taken.",
    ]);
    expect(productionConfigWarnings({ ...VALID })).toEqual(["SENTRY_DSN is unset: server errors are only in the container log."]);
    expect(productionConfigWarnings({ ...VALID, STRIPE_CONNECT_WEBHOOK_SECRET: undefined, SENTRY_DSN: "https://x@sentry.example/1" })).toEqual([
      "STRIPE_CONNECT_WEBHOOK_SECRET is unset: clients' online invoice payments won't be recorded.",
    ]);
    expect(productionConfigWarnings({ NODE_ENV: "development", STRIPE_SECRET_KEY: "sk_test_x" })).toEqual([]);
  });
});
