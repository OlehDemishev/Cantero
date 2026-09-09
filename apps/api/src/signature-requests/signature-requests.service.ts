import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CreateSignatureRequestInput, SignSignatureRequestInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { MailService } from "../common/mail/mail.service";
import { decodePngDataUrl } from "../common/signature";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { OutboxService } from "../common/webhooks/outbox.service";

@Injectable()
export class SignatureRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  list(companyId: string) {
    return this.prisma.signatureRequest.findMany({
      where: { companyId },
      include: { document: { select: { id: true, name: true } }, signers: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(companyId: string, id: string) {
    const request = await this.findOrThrow(companyId, id);
    return request;
  }

  async create(companyId: string, actor: AuditActor, input: CreateSignatureRequestInput) {
    const document = await this.prisma.document.findFirst({ where: { id: input.documentId, companyId, deletedAt: null } });
    if (!document) throw new NotFoundException("Document not found");

    const request = await this.prisma.signatureRequest.create({
      data: {
        companyId,
        documentId: input.documentId,
        title: input.title,
        createdByUserId: actor.userId,
        signers: {
          create: input.signers.map((signer, index) => ({
            order: index + 1,
            name: signer.name,
            email: signer.email,
            accessToken: randomBytes(24).toString("hex"),
          })),
        },
      },
      include: { document: { select: { id: true, name: true } }, signers: { orderBy: { order: "asc" } } },
    });
    this.audit.record(companyId, actor, "signature_request.created", "SignatureRequest", request.id, `Created signature request "${request.title}"`);
    return request;
  }

  /** Emails only the first signer — later signers are notified in turn as each prior signer signs. */
  async send(companyId: string, actor: AuditActor, id: string) {
    const request = await this.findOrThrow(companyId, id);
    if (request.status !== "draft") throw new BadRequestException("Only a draft signature request can be sent");

    const updated = await this.prisma.signatureRequest.update({
      where: { id },
      data: { status: "sent" },
      include: { document: { select: { id: true, name: true } }, signers: { orderBy: { order: "asc" } } },
    });
    await this.notifySigner(companyId, updated.title, updated.signers[0]);
    this.audit.record(companyId, actor, "signature_request.sent", "SignatureRequest", id, `Sent "${request.title}" for signature`);
    return updated;
  }

  async void(companyId: string, actor: AuditActor, id: string) {
    const request = await this.findOrThrow(companyId, id);
    if (request.status === "completed" || request.status === "voided") {
      throw new BadRequestException("This signature request can no longer be voided");
    }
    const updated = await this.prisma.signatureRequest.update({ where: { id }, data: { status: "voided" } });
    this.audit.record(companyId, actor, "signature_request.voided", "SignatureRequest", id, `Voided "${request.title}"`);
    return updated;
  }

  /** Public, unauthenticated — resolved by one signer's own token, not the request's id. */
  async getByToken(signerToken: string) {
    const signer = await this.findSignerOrThrow(signerToken);
    const orderedSigners = signer.signatureRequest.signers;
    const earlierUnsigned = orderedSigners.some((s) => s.order < signer.order && !s.signedAt);

    return {
      title: signer.signatureRequest.title,
      documentName: signer.signatureRequest.document.name,
      companyName: signer.signatureRequest.company.name,
      status: signer.signatureRequest.status,
      signerName: signer.name,
      signedAt: signer.signedAt,
      isYourTurn: signer.signatureRequest.status === "sent" && !signer.signedAt && !earlierUnsigned,
      signers: orderedSigners.map((s) => ({ name: s.name, order: s.order, signedAt: s.signedAt })),
    };
  }

  async downloadDocumentByToken(signerToken: string): Promise<{ buffer: Buffer; name: string; mimeType: string }> {
    const signer = await this.findSignerOrThrow(signerToken);
    const buffer = await this.storage.read(signer.signatureRequest.document.storageKey);
    return { buffer, name: signer.signatureRequest.document.name, mimeType: signer.signatureRequest.document.mimeType };
  }

  async sign(signerToken: string, input: SignSignatureRequestInput, signerIp?: string) {
    const signer = await this.findSignerOrThrow(signerToken);
    if (signer.signedAt) throw new BadRequestException("You have already signed this document");
    if (signer.signatureRequest.status !== "sent") throw new BadRequestException("This request is not awaiting a signature");

    const orderedSigners = signer.signatureRequest.signers;
    const earlierUnsigned = orderedSigners.some((s) => s.order < signer.order && !s.signedAt);
    if (earlierUnsigned) throw new BadRequestException("An earlier signer has not signed yet");

    const stored = await this.storage.save(signer.signatureRequest.companyId, "signature.png", decodePngDataUrl(input.signatureDataUrl));
    const signedAt = new Date();
    await this.prisma.signatureRequestSigner.update({
      where: { id: signer.id },
      data: { signedAt, signatureImageKey: stored.storageKey, signedIp: signerIp },
    });

    const remaining = orderedSigners.filter((s) => s.id !== signer.id && !s.signedAt).sort((a, b) => a.order - b.order);
    if (remaining.length === 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.signatureRequest.update({
          where: { id: signer.signatureRequestId },
          data: { status: "completed", completedAt: signedAt },
        });
        await this.outbox.enqueue(tx, signer.signatureRequest.companyId, "signature_request.completed", {
          signatureRequestId: signer.signatureRequestId,
        });
      });
      this.audit.record(
        signer.signatureRequest.companyId,
        { name: signer.name },
        "signature_request.completed",
        "SignatureRequest",
        signer.signatureRequestId,
        `All signers completed "${signer.signatureRequest.title}"`,
      );
      return { status: "completed" as const };
    }

    await this.notifySigner(signer.signatureRequest.companyId, signer.signatureRequest.title, remaining[0]);
    return { status: "sent" as const };
  }

  private async notifySigner(companyId: string, requestTitle: string, signer: { id: string; name: string; email: string; accessToken: string }) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
    const link = `${webOrigin}/sign/${signer.accessToken}`;
    this.mail.send({
      to: signer.email,
      subject: `${requestTitle} — please sign`,
      html: `<p>${company.name} has sent you a document to review and sign: <strong>${requestTitle}</strong>.</p><p><a href="${link}">View and sign</a></p>`,
      text: `${company.name} has sent you a document to review and sign: ${requestTitle}.\n\nView and sign: ${link}`,
    });
    await this.prisma.signatureRequestSigner.update({ where: { id: signer.id }, data: { notifiedAt: new Date() } });
  }

  private async findOrThrow(companyId: string, id: string) {
    const request = await this.prisma.signatureRequest.findFirst({
      where: { id, companyId },
      include: { document: { select: { id: true, name: true } }, signers: { orderBy: { order: "asc" } } },
    });
    if (!request) throw new NotFoundException("Signature request not found");
    return request;
  }

  private async findSignerOrThrow(signerToken: string) {
    const signer = await this.prisma.signatureRequestSigner.findUnique({
      where: { accessToken: signerToken },
      include: {
        signatureRequest: {
          include: {
            document: { select: { name: true, mimeType: true, storageKey: true } },
            company: { select: { name: true } },
            signers: { orderBy: { order: "asc" } },
          },
        },
      },
    });
    if (!signer) throw new NotFoundException("Signing link not found");
    return signer;
  }
}
