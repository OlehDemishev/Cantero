import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB — contracts/photos, not video

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  list(companyId: string, projectId?: string, invoiceId?: string) {
    return this.prisma.document.findMany({
      where: { companyId, ...(projectId ? { projectId } : {}), ...(invoiceId ? { invoiceId } : {}) },
      orderBy: { createdAt: "desc" },
    });
  }

  async upload(
    companyId: string,
    file: { originalname: string; mimetype: string; buffer: Buffer; size: number },
    meta: { projectId?: string; invoiceId?: string },
  ) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new NotFoundException("File exceeds the 25MB limit");
    }
    if (meta.projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: meta.projectId, companyId } });
      if (!project) throw new NotFoundException("Project not found");
    }
    if (meta.invoiceId) {
      const invoice = await this.prisma.invoice.findFirst({ where: { id: meta.invoiceId, companyId } });
      if (!invoice) throw new NotFoundException("Invoice not found");
    }

    const stored = await this.storage.save(companyId, file.originalname, file.buffer);

    return this.prisma.document.create({
      data: {
        companyId,
        projectId: meta.projectId,
        invoiceId: meta.invoiceId,
        name: file.originalname,
        storageKey: stored.storageKey,
        mimeType: file.mimetype,
      },
    });
  }

  async download(companyId: string, id: string): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
    const doc = await this.prisma.document.findFirst({ where: { id, companyId } });
    if (!doc) throw new NotFoundException("Document not found");
    const buffer = await this.storage.read(doc.storageKey);
    return { buffer, name: doc.name, mimeType: doc.mimeType };
  }
}
