import { randomBytes } from "node:crypto";
import { NotFoundException } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import type { AddCompanyDocumentInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { StorageService } from "../common/storage/storage.service";

@Injectable()
export class CompanyCoiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  listDocuments(companyId: string) {
    return this.prisma.companyDocument.findMany({ where: { companyId }, orderBy: { expiresAt: "asc" } });
  }

  async addDocument(companyId: string, actor: AuditActor, input: AddCompanyDocumentInput) {
    const doc = await this.prisma.companyDocument.create({
      data: { companyId, type: input.type, name: input.name, expiresAt: new Date(input.expiresAt) },
    });
    this.audit.record(
      companyId,
      actor,
      "company_document.added",
      "CompanyDocument",
      doc.id,
      `Added ${input.type.replace(/_/g, " ")}, expires ${doc.expiresAt.toLocaleDateString()}`,
    );
    return doc;
  }

  async deleteDocument(companyId: string, documentId: string) {
    const doc = await this.prisma.companyDocument.findFirst({ where: { id: documentId, companyId } });
    if (!doc) throw new NotFoundException("Document not found");
    await this.prisma.companyDocument.delete({ where: { id: documentId } });
    return { ok: true };
  }

  /** Same shareable-link pattern as SubcontractorsService.setPublicListed() — a token is
   * generated once and reused across on/off toggles, so a previously-shared link doesn't
   * silently start pointing at someone else's data if re-enabled later. */
  async setCoiPubliclyShared(companyId: string, coiPubliclyShared: boolean) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    return this.prisma.company.update({
      where: { id: companyId },
      data: {
        coiPubliclyShared,
        coiPublicToken: coiPubliclyShared ? (company.coiPublicToken ?? randomBytes(16).toString("hex")) : company.coiPublicToken,
      },
    });
  }

  /** Public, unauthenticated — only currently-valid (non-expired) certificates are listed, so a
   * client or lender never sees a lapsed policy as if it were current. */
  async getPublicCoi(token: string) {
    const company = await this.prisma.company.findFirst({
      where: { coiPublicToken: token, coiPubliclyShared: true },
      select: { id: true, name: true },
    });
    if (!company) throw new NotFoundException("Certificates not found");

    const documents = await this.prisma.companyDocument.findMany({
      where: { companyId: company.id, expiresAt: { gt: new Date() } },
      include: { attachments: { where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { type: "asc" },
    });

    return {
      companyName: company.name,
      documents: documents.map((d) => ({
        id: d.id,
        type: d.type,
        name: d.name,
        expiresAt: d.expiresAt,
        fileDocumentId: d.attachments[0]?.id ?? null,
        fileName: d.attachments[0]?.name ?? null,
      })),
    };
  }

  /** Guards the public download route: the requested Document must actually be the/an
   * attachment on a non-expired CompanyDocument belonging to the token's company — mirrors
   * DocumentsService.download()'s body once ownership is established, since that method takes
   * a companyId scoping this public route deliberately doesn't have. */
  async downloadPublicDocument(token: string, documentId: string): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
    const company = await this.prisma.company.findFirst({ where: { coiPublicToken: token, coiPubliclyShared: true } });
    if (!company) throw new NotFoundException("Certificates not found");

    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        deletedAt: null,
        companyDocument: { companyId: company.id, expiresAt: { gt: new Date() } },
      },
    });
    if (!document) throw new NotFoundException("Certificate file not found");

    const buffer = await this.storage.read(document.storageKey);
    return { buffer, name: document.name, mimeType: document.mimeType };
  }
}
