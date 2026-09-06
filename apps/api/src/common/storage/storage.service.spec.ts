import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { StorageService } from "./storage.service";

describe("StorageService — local disk (no S3_BUCKET configured)", () => {
  let service: StorageService;
  let uploadsDir: string;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    uploadsDir = await mkdtemp(join(tmpdir(), "cantero-storage-test-"));
    process.env = { ...originalEnv, UPLOADS_DIR: uploadsDir, S3_BUCKET: undefined };
    delete process.env.S3_BUCKET;
    service = new StorageService();
  });

  afterEach(async () => {
    process.env = originalEnv;
    await rm(uploadsDir, { recursive: true, force: true });
  });

  it("round-trips a file through save() and read()", async () => {
    const buffer = Buffer.from("hello world");
    const stored = await service.save("company-a", "receipt.pdf", buffer);

    const read = await service.read(stored.storageKey);

    expect(read.toString()).toBe("hello world");
    expect(stored.size).toBe(buffer.length);
  });

  it("scopes the storage key under the company id", async () => {
    const stored = await service.save("company-a", "receipt.pdf", Buffer.from("x"));
    expect(stored.storageKey.startsWith("company-a/")).toBe(true);
  });

  it("sanitizes an attacker-controlled filename so it can't escape the company directory", async () => {
    const stored = await service.save("company-a", "../../etc/passwd", Buffer.from("x"));

    // Every "/" in the original name is stripped, so no path-separator survives into the
    // sanitized filename segment — the literal ".." characters that remain are harmless without
    // a "/" to turn them into a traversal. The key stays exactly two segments: companyId/filename.
    const segments = stored.storageKey.split("/");
    expect(segments).toHaveLength(2);
    expect(segments[0]).toBe("company-a");
    expect(segments[1]).not.toContain("/");

    // And the write genuinely landed inside this company's own directory, not somewhere else.
    const read = await service.read(stored.storageKey);
    expect(read.toString()).toBe("x");
  });

  it("gives two uploads with the same original name different storage keys", async () => {
    const first = await service.save("company-a", "same-name.pdf", Buffer.from("a"));
    const second = await service.save("company-a", "same-name.pdf", Buffer.from("b"));

    expect(first.storageKey).not.toBe(second.storageKey);
    expect((await service.read(first.storageKey)).toString()).toBe("a");
    expect((await service.read(second.storageKey)).toString()).toBe("b");
  });
});

describe("StorageService — S3 backend (S3_BUCKET configured)", () => {
  let service: StorageService;
  let sendMock: jest.SpiedFunction<S3Client["send"]>;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv, S3_BUCKET: "cantero-uploads", S3_REGION: "us-east-1" };
    sendMock = jest.spyOn(S3Client.prototype, "send").mockImplementation() as never;
    service = new StorageService();
  });

  afterEach(() => {
    process.env = originalEnv;
    sendMock.mockRestore();
  });

  it("uploads via PutObjectCommand to the configured bucket, keyed the same way as local disk", async () => {
    sendMock.mockResolvedValue({} as never);

    const stored = await service.save("company-a", "receipt.pdf", Buffer.from("hello"));

    expect(stored.storageKey.startsWith("company-a/")).toBe(true);
    expect(stored.storageKey.endsWith("-receipt.pdf")).toBe(true);
    const command = sendMock.mock.calls[0][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({ Bucket: "cantero-uploads", Key: stored.storageKey, Body: Buffer.from("hello") });
  });

  it("downloads via GetObjectCommand and returns a Buffer", async () => {
    const body = Readable.from([Buffer.from("hello")]) as never;
    (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray = async () => new Uint8Array(Buffer.from("hello"));
    sendMock.mockResolvedValue({ Body: body } as never);

    const result = await service.read("company-a/some-key.pdf");

    expect(result.toString()).toBe("hello");
    const command = sendMock.mock.calls[0][0] as GetObjectCommand;
    expect(command).toBeInstanceOf(GetObjectCommand);
    expect(command.input).toEqual({ Bucket: "cantero-uploads", Key: "company-a/some-key.pdf" });
  });
});
