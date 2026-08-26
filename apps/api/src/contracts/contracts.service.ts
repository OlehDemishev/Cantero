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

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  list(companyId: string, projectId?: string) {
    return this.prisma.contract.findMany({
      where: { companyId, ...(projectId ? { projectId } : {}) },
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
