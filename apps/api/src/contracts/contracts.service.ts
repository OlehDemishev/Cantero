import { randomBytes } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CreateContractInput, SignContractInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { decodePngDataUrl } from "../common/signature";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { DocusignService } from "./docusign.service";
import { ProjectAccessService, type ProjectViewer } from "../common/project-access/project-access.service";

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly docusign: DocusignService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async list(companyId: string, projectId?: string, viewer: ProjectViewer = {}) {
    const visible = await this.projectAccess.visibleWhere(companyId, "Contract", viewer.userId, viewer.role);
    return this.prisma.contract.findMany({
      where: { AND: [{ companyId, ...(projectId ? { projectId } : {}) }, visible] },
      include: { client: { select: { id: true, name: true } }, subcontractor: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(companyId: string, id: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id, companyId },
      include: { client: { select: { id: true, name: true } }, subcontractor: { select: { id: true, name: true } } },
    });
    if (!contract) throw new NotFoundException("Contract not found");
    return contract;
  }

  async create(companyId: string, actor: AuditActor, input: CreateContractInput) {
    const project = await this.prisma.project.findFirst({ where: { id: input.projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
    if (input.clientId) {
      const client = await this.prisma.client.findFirst({ where: { id: input.clientId, companyId } });
      if (!client) throw new BadRequestException("Client does not belong to this company");
    }
    if (input.subcontractorId) {
      const sub = await this.prisma.subcontractor.findFirst({ where: { id: input.subcontractorId, companyId } });
      if (!sub) throw new BadRequestException("Subcontractor does not belong to this company");
    }

    let body = input.body ?? "";
    if (input.templateId) {
      const template = await this.prisma.contractTemplate.findFirst({ where: { id: input.templateId, companyId } });
      if (!template) throw new NotFoundException("Contract template not found");
      body = template.body;
    }

    const contract = await this.prisma.contract.create({
      data: {
        companyId,
        projectId: input.projectId,
        clientId: input.clientId,
        subcontractorId: input.subcontractorId,
        title: input.title,
        body,
      },
      include: { client: { select: { id: true, name: true } }, subcontractor: { select: { id: true, name: true } } },
    });
    this.audit.record(companyId, actor, "contract.created", "Contract", contract.id, `Created contract "${contract.title}"`);
    return contract;
  }

  async updateBody(companyId: string, id: string, body: string) {
    const contract = await this.findOrThrow(companyId, id);
    if (contract.status !== "draft") throw new BadRequestException("Only a draft contract can be edited");
    return this.prisma.contract.update({ where: { id }, data: { body } });
  }

  /** Generates the signing link and, when the contract is attached to a Client with an email
   * on file, emails it — the same shape as EstimatesService.send()/ChangeOrdersService.send(). */
  async send(companyId: string, actor: AuditActor, id: string) {
    const contract = await this.findOrThrow(companyId, id);
    if (contract.status !== "draft") throw new BadRequestException("Only a draft contract can be sent");

    const updated = await this.prisma.contract.update({
      where: { id },
      data: { status: "sent", clientAccessToken: randomBytes(24).toString("hex"), sentAt: new Date() },
      include: { client: { select: { id: true, name: true, email: true } } },
    });
    this.audit.record(companyId, actor, "contract.sent", "Contract", id, `Sent contract "${contract.title}" for signature`);

    if (updated.client?.email) {
      const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
      const webOrigin = this.config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";
      const link = `${webOrigin}/contract/${updated.clientAccessToken}`;
      this.mail.send({
        to: updated.client.email,
        subject: `${contract.title} — please sign`,
        html: `<p>${company.name} has sent you a contract to review and sign: <strong>${contract.title}</strong>.</p><p><a href="${link}">View and sign the contract</a></p>`,
        text: `${company.name} has sent you a contract to review and sign: ${contract.title}.\n\nView and sign: ${link}`,
      });
    }

    return updated;
  }

  /** Alternative to send() — routes the contract through a real DocuSign envelope instead of
   * this app's own link-and-canvas signature capture, for the stronger audit trail (certificate
   * of completion, tamper-evident signing record) some clients specifically expect from DocuSign.
   * Needs a client with an email on file, since DocuSign routes envelopes by email rather than a
   * bare link. */
  async sendViaDocusign(companyId: string, actor: AuditActor, id: string) {
    const contract = await this.findOrThrow(companyId, id);
    if (contract.status !== "draft") throw new BadRequestException("Only a draft contract can be sent");
    const client = contract.clientId ? await this.prisma.client.findUnique({ where: { id: contract.clientId } }) : null;
    if (!client?.email) {
      throw new BadRequestException("This contract needs a client with an email on file to send via DocuSign");
    }

    const connection = await this.docusign.getConnectionOrThrow(companyId);
    const pdfBuffer = await this.generateDocusignPdf(companyId, contract);
    const { envelopeId } = await this.docusign.createEnvelope(connection, {
      pdfBase64: pdfBuffer.toString("base64"),
      documentName: `${contract.title}.pdf`,
      emailSubject: `${contract.title} — please sign`,
      signerEmail: client.email,
      signerName: client.name,
    });

    const updated = await this.prisma.contract.update({
      where: { id },
      data: { status: "sent", sentAt: new Date(), docusignEnvelopeId: envelopeId, docusignStatus: "sent" },
    });
    this.audit.record(companyId, actor, "contract.sent", "Contract", id, `Sent contract "${contract.title}" via DocuSign`);
    return updated;
  }

  /** Polls DocuSign for this envelope's current status — there's no webhook wired up (see
   * DocusignService's doc comment), so DocusignPollingService's background sweep (or, for
   * immediate feedback right after sending, a direct call) is what actually calls this now rather
   * than a "check now" button. Once DocuSign reports "completed", downloads the signed document
   * (with DocuSign's own certificate of completion) and transitions the contract to signed, same
   * end state the native signature flow reaches via sign(). A "declined" or "voided" envelope
   * transitions the contract to void instead — both are terminal DocuSign outcomes, and voiding
   * here (rather than leaving status stuck on "sent") is what makes the polling sweep's
   * `status: "sent"` filter naturally stop re-checking this contract. */
  async refreshDocusignStatus(companyId: string, id: string) {
    const contract = await this.findOrThrow(companyId, id);
    if (!contract.docusignEnvelopeId) throw new BadRequestException("This contract wasn't sent via DocuSign");

    const connection = await this.docusign.getConnectionOrThrow(companyId);
    const { status, completedAt } = await this.docusign.getEnvelopeStatus(connection, contract.docusignEnvelopeId);

    if (status === "completed" && contract.status !== "signed") {
      const signedPdf = await this.docusign.downloadCombinedDocument(connection, contract.docusignEnvelopeId);
      const stored = await this.storage.save(companyId, "docusign-signed.pdf", signedPdf);
      const client = contract.clientId ? await this.prisma.client.findUnique({ where: { id: contract.clientId } }) : null;

      const updated = await this.prisma.contract.update({
        where: { id },
        data: {
          status: "signed",
          docusignStatus: status,
          docusignSignedPdfKey: stored.storageKey,
          signerName: client?.name ?? null,
          signedAt: completedAt ? new Date(completedAt) : new Date(),
        },
      });
      this.audit.record(companyId, { name: "DocuSign" }, "contract.signed", "Contract", id, `Signed contract "${contract.title}" via DocuSign`);
      return updated;
    }

    if ((status === "declined" || status === "voided") && contract.status !== "void") {
      const updated = await this.prisma.contract.update({ where: { id }, data: { status: "void", docusignStatus: status } });
      this.audit.record(companyId, { name: "DocuSign" }, "contract.voided", "Contract", id, `Contract "${contract.title}" ${status} via DocuSign`);
      return updated;
    }

    return this.prisma.contract.update({ where: { id }, data: { docusignStatus: status } });
  }

  async getDocusignSignedPdf(companyId: string, id: string): Promise<Buffer> {
    const contract = await this.findOrThrow(companyId, id);
    if (!contract.docusignSignedPdfKey) throw new NotFoundException("No DocuSign-signed document on file");
    return this.storage.read(contract.docusignSignedPdfKey);
  }

  /** Same rendering as generatePdf(), but with a literal `/sig1/` anchor appended after the body
   * for DocusignService.createEnvelope() to place the Sign Here tab against — never shown on the
   * customer-facing downloadable PDF generatePdf() itself produces. */
  private async generateDocusignPdf(companyId: string, contract: { title: string; body: string }): Promise<Buffer> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey) : undefined;
    return this.pdfService.renderTextDocument({
      title: contract.title,
      subtitle: company.name,
      meta: [],
      body: `${contract.body}\n\nSignature: /sig1/`,
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
    });
  }

  async void(companyId: string, actor: AuditActor, id: string) {
    const contract = await this.findOrThrow(companyId, id);
    if (contract.status === "void") throw new BadRequestException("Contract is already void");
    const updated = await this.prisma.contract.update({ where: { id }, data: { status: "void" } });
    this.audit.record(companyId, actor, "contract.voided", "Contract", id, `Voided contract "${contract.title}"`);
    return updated;
  }

  /** Public, unauthenticated — no internal ids/costs beyond what's already in the body. */
  async getByToken(token: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { clientAccessToken: token },
      include: { company: { select: { name: true } }, project: { select: { name: true } } },
    });
    if (!contract) throw new NotFoundException("Contract not found");
    return {
      id: contract.id,
      title: contract.title,
      body: contract.body,
      status: contract.status,
      companyName: contract.company.name,
      projectName: contract.project.name,
      signerName: contract.signerName,
      signedAt: contract.signedAt,
    };
  }

  async sign(token: string, input: SignContractInput, signerIp?: string) {
    const contract = await this.prisma.contract.findFirst({ where: { clientAccessToken: token } });
    if (!contract) throw new NotFoundException("Contract not found");
    if (contract.status !== "sent") throw new BadRequestException("This contract is not awaiting a signature");

    const stored = await this.storage.save(contract.companyId, "signature.png", decodePngDataUrl(input.signatureDataUrl));

    const updated = await this.prisma.contract.update({
      where: { id: contract.id },
      data: {
        status: "signed",
        signerName: input.signerName,
        signatureImageKey: stored.storageKey,
        signedIp: signerIp,
        signedAt: new Date(),
      },
    });
    this.audit.record(
      contract.companyId,
      { name: input.signerName },
      "contract.signed",
      "Contract",
      contract.id,
      `Signed contract "${contract.title}"`,
    );
    return { status: updated.status };
  }

  async getSignature(companyId: string, id: string): Promise<Buffer> {
    const contract = await this.findOrThrow(companyId, id);
    if (!contract.signatureImageKey) throw new NotFoundException("No signature on file");
    return this.storage.read(contract.signatureImageKey);
  }

  async generatePdf(companyId: string, id: string): Promise<Buffer> {
    const contract = await this.findOrThrow(companyId, id);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const logoBuffer = company.logoStorageKey ? await this.storage.read(company.logoStorageKey) : undefined;
    const signatureImageBuffer = contract.signatureImageKey ? await this.storage.read(contract.signatureImageKey) : undefined;

    return this.pdfService.renderTextDocument({
      title: contract.title,
      subtitle: company.name,
      meta: [{ label: "Status", value: contract.status }],
      body: contract.body,
      branding: { logoBuffer, accentColor: company.brandColor ?? undefined },
      signature:
        contract.status === "signed" && contract.signerName && contract.signedAt
          ? { imageBuffer: signatureImageBuffer, signerName: contract.signerName, signedAt: contract.signedAt }
          : undefined,
    });
  }

  private async findOrThrow(companyId: string, id: string) {
    const contract = await this.prisma.contract.findFirst({ where: { id, companyId } });
    if (!contract) throw new NotFoundException("Contract not found");
    return contract;
  }
}
