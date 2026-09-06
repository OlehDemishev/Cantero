import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface StoredFile {
  storageKey: string;
  size: number;
}

/**
 * Object storage, scoped by company so one tenant can never read another's files by guessing a
 * key. Backed by S3 (or any S3-compatible provider — MinIO, R2, Spaces, ...) when S3_BUCKET is
 * configured; falls back to local disk otherwise, same reasoning as MailService/SmsService
 * falling back to console logging without SMTP_HOST/TWILIO_ACCOUNT_SID — lets every upload/
 * download flow be exercised end-to-end in local dev with zero cloud setup. Local disk is NOT
 * safe for a real deployment: it doesn't survive a redeploy (ephemeral filesystem on most
 * platforms) and doesn't work across more than one instance, so S3_BUCKET must be set in
 * production. Nothing upstream (DocumentsService, controllers, ~20 other call sites) needs to
 * know which backend is active — both branches speak the same save()/read() contract.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root = process.env.UPLOADS_DIR ?? join(process.cwd(), "uploads");
  private readonly bucket = process.env.S3_BUCKET;
  private readonly s3Client: S3Client | null;

  constructor() {
    this.s3Client = this.bucket
      ? new S3Client({
          region: process.env.S3_REGION ?? "us-east-1",
          endpoint: process.env.S3_ENDPOINT,
          forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
          credentials:
            process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
              ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
              : undefined,
        })
      : null;
    if (!this.s3Client) {
      this.logger.warn("S3_BUCKET not configured — storing uploads on local disk. Not safe for production (see StorageService).");
    }
  }

  async save(companyId: string, originalName: string, buffer: Buffer): Promise<StoredFile> {
    const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const storageKey = `${companyId}/${randomUUID()}-${safeName}`;

    if (this.s3Client) {
      await this.s3Client.send(new PutObjectCommand({ Bucket: this.bucket, Key: storageKey, Body: buffer }));
    } else {
      const dir = join(this.root, companyId);
      await mkdir(dir, { recursive: true });
      await writeFile(join(this.root, storageKey), buffer);
    }
    return { storageKey, size: buffer.length };
  }

  async read(storageKey: string): Promise<Buffer> {
    if (this.s3Client) {
      const result = await this.s3Client.send(new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }));
      return Buffer.from(await result.Body!.transformToByteArray());
    }
    return readFile(join(this.root, storageKey));
  }
}
