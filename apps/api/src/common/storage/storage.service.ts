import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface StoredFile {
  storageKey: string;
  size: number;
}

/**
 * Local-disk object storage, scoped by company so one tenant can never read
 * another's files by guessing a path. Swapping to S3-compatible storage later
 * means reimplementing `save`/`read` behind this same interface — nothing
 * upstream (DocumentsService, controllers) needs to change.
 */
@Injectable()
export class StorageService {
  private readonly root = process.env.UPLOADS_DIR ?? join(process.cwd(), "uploads");

  async save(companyId: string, originalName: string, buffer: Buffer): Promise<StoredFile> {
    const dir = join(this.root, companyId);
    await mkdir(dir, { recursive: true });
    const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const storageKey = `${companyId}/${randomUUID()}-${safeName}`;
    await writeFile(join(this.root, storageKey), buffer);
    return { storageKey, size: buffer.length };
  }

  async read(storageKey: string): Promise<Buffer> {
    return readFile(join(this.root, storageKey));
  }
}
