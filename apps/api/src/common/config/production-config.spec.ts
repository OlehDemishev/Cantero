import { assertProductionConfig } from "./production-config";

const VALID = { NODE_ENV: "production", S3_BUCKET: "cantero-uploads", TRUST_PROXY_HOPS: "1" };

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

  it("lists every problem at once", () => {
    expect(() => assertProductionConfig({ NODE_ENV: "production" })).toThrow(/S3_BUCKET[\s\S]*TRUST_PROXY_HOPS/);
  });
});
