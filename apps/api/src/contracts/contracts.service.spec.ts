import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { ContractsService } from "./contracts.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { DocusignService } from "./docusign.service";
import { projectAccessThatSeesAll } from "../common/project-access/project-access.testing";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Jane" };

describe("ContractsService", () => {
  let service: ContractsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    client: { findFirst: jest.Mock; findUnique: jest.Mock };
    subcontractor: { findFirst: jest.Mock };
    contractTemplate: { findFirst: jest.Mock };
    contract: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
  };
  let storage: { save: jest.Mock; read: jest.Mock };
  let mail: { send: jest.Mock };
  let docusign: {
    getConnectionOrThrow: jest.Mock;
    createEnvelope: jest.Mock;
    getEnvelopeStatus: jest.Mock;
    downloadCombinedDocument: jest.Mock;
  };
  let pdfService: { renderTextDocument: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      client: { findFirst: jest.fn(), findUnique: jest.fn() },
      subcontractor: { findFirst: jest.fn() },
      contractTemplate: { findFirst: jest.fn() },
      contract: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
    };
    storage = { save: jest.fn(), read: jest.fn() };
    mail = { send: jest.fn() };
    docusign = {
      getConnectionOrThrow: jest.fn(),
      createEnvelope: jest.fn(),
      getEnvelopeStatus: jest.fn(),
      downloadCombinedDocument: jest.fn(),
    };
    pdfService = { renderTextDocument: jest.fn().mockResolvedValue(Buffer.from("pdf")) };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [projectAccessThatSeesAll(), 
        ContractsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: pdfService },
        { provide: StorageService, useValue: storage },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: MailService, useValue: mail },
        { provide: DocusignService, useValue: docusign },
      ],
    }).compile();

    service = module.get(ContractsService);
  });

  describe("create()", () => {
    it("rejects when the project doesn't belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, { projectId: "p1", title: "MSA", body: "Terms..." }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.contract.create).not.toHaveBeenCalled();
    });

    it("clones the template body when templateId is given", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "p1" });
      prisma.contractTemplate.findFirst.mockResolvedValue({ id: "tmpl-1", body: "Standard terms..." });
      prisma.contract.create.mockResolvedValue({ id: "c1", title: "MSA", body: "Standard terms..." });

      await service.create(COMPANY_A, ACTOR, { projectId: "p1", title: "MSA", templateId: "tmpl-1" });

      expect(prisma.contract.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ body: "Standard terms..." }) }),
      );
    });

    it("rejects a clientId that belongs to another company", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "p1" });
      prisma.client.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, { projectId: "p1", title: "MSA", body: "Terms...", clientId: "foreign-client" }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("send()", () => {
    it("rejects sending a contract that isn't a draft", async () => {
      prisma.contract.findFirst.mockResolvedValue({ id: "c1", companyId: COMPANY_A, status: "sent", title: "MSA" });

      await expect(service.send(COMPANY_A, ACTOR, "c1")).rejects.toThrow(BadRequestException);
      expect(prisma.contract.update).not.toHaveBeenCalled();
    });

    it("generates a signing token and emails the client when one is on file", async () => {
      prisma.contract.findFirst.mockResolvedValue({ id: "c1", companyId: COMPANY_A, status: "draft", title: "MSA" });
      prisma.contract.update.mockResolvedValue({
        id: "c1",
        clientAccessToken: "tok-abc",
        client: { email: "client@example.com" },
      });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ name: "Acme" });

      await service.send(COMPANY_A, ACTOR, "c1");

      expect(prisma.contract.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "sent" }) }),
      );
      expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: "client@example.com" }));
    });

    it("skips the email when the contract has no client with an address on file", async () => {
      prisma.contract.findFirst.mockResolvedValue({ id: "c1", companyId: COMPANY_A, status: "draft", title: "MSA" });
      prisma.contract.update.mockResolvedValue({ id: "c1", clientAccessToken: "tok-abc", client: null });

      await service.send(COMPANY_A, ACTOR, "c1");

      expect(mail.send).not.toHaveBeenCalled();
    });
  });

  describe("sendViaDocusign()", () => {
    it("rejects sending a contract that isn't a draft", async () => {
      prisma.contract.findFirst.mockResolvedValue({ id: "c1", companyId: COMPANY_A, status: "sent", title: "MSA" });

      await expect(service.sendViaDocusign(COMPANY_A, ACTOR, "c1")).rejects.toThrow(BadRequestException);
      expect(docusign.getConnectionOrThrow).not.toHaveBeenCalled();
    });

    it("rejects when the contract's client has no email on file", async () => {
      prisma.contract.findFirst.mockResolvedValue({ id: "c1", companyId: COMPANY_A, status: "draft", title: "MSA", clientId: "client-1" });
      prisma.client.findUnique.mockResolvedValue({ id: "client-1", name: "Acme", email: null });

      await expect(service.sendViaDocusign(COMPANY_A, ACTOR, "c1")).rejects.toThrow(BadRequestException);
      expect(docusign.getConnectionOrThrow).not.toHaveBeenCalled();
    });

    it("generates the PDF with the anchor marker, creates the envelope, and stores its id", async () => {
      prisma.contract.findFirst.mockResolvedValue({
        id: "c1",
        companyId: COMPANY_A,
        status: "draft",
        title: "MSA",
        body: "Terms...",
        clientId: "client-1",
      });
      prisma.client.findUnique.mockResolvedValue({ id: "client-1", name: "Acme Corp", email: "client@example.com" });
      prisma.company.findUniqueOrThrow.mockResolvedValue({ name: "Cantero Demo", logoStorageKey: null, brandColor: null });
      docusign.getConnectionOrThrow.mockResolvedValue({ accountId: "acct-1" });
      docusign.createEnvelope.mockResolvedValue({ envelopeId: "env-1" });
      prisma.contract.update.mockResolvedValue({ id: "c1", status: "sent", docusignEnvelopeId: "env-1" });

      await service.sendViaDocusign(COMPANY_A, ACTOR, "c1");

      expect(pdfService.renderTextDocument).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining("/sig1/") }));
      expect(docusign.createEnvelope).toHaveBeenCalledWith(
        { accountId: "acct-1" },
        expect.objectContaining({ signerEmail: "client@example.com", signerName: "Acme Corp" }),
      );
      expect(prisma.contract.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: { status: "sent", sentAt: expect.any(Date), docusignEnvelopeId: "env-1", docusignStatus: "sent" },
      });
    });
  });

  describe("refreshDocusignStatus()", () => {
    it("rejects a contract that was never sent via DocuSign", async () => {
      prisma.contract.findFirst.mockResolvedValue({ id: "c1", companyId: COMPANY_A, docusignEnvelopeId: null });

      await expect(service.refreshDocusignStatus(COMPANY_A, "c1")).rejects.toThrow(BadRequestException);
    });

    it("just updates docusignStatus when the envelope isn't completed yet", async () => {
      prisma.contract.findFirst.mockResolvedValue({ id: "c1", companyId: COMPANY_A, status: "sent", docusignEnvelopeId: "env-1" });
      docusign.getConnectionOrThrow.mockResolvedValue({ accountId: "acct-1" });
      docusign.getEnvelopeStatus.mockResolvedValue({ status: "delivered", completedAt: null });

      await service.refreshDocusignStatus(COMPANY_A, "c1");

      expect(docusign.downloadCombinedDocument).not.toHaveBeenCalled();
      expect(prisma.contract.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { docusignStatus: "delivered" } });
    });

    it("downloads the signed document and marks the contract signed once DocuSign reports completed", async () => {
      prisma.contract.findFirst.mockResolvedValue({
        id: "c1",
        companyId: COMPANY_A,
        status: "sent",
        title: "MSA",
        docusignEnvelopeId: "env-1",
        clientId: "client-1",
      });
      prisma.client.findUnique.mockResolvedValue({ id: "client-1", name: "Acme Corp", email: "client@example.com" });
      docusign.getConnectionOrThrow.mockResolvedValue({ accountId: "acct-1" });
      docusign.getEnvelopeStatus.mockResolvedValue({ status: "completed", completedAt: "2026-09-16T10:00:00Z" });
      docusign.downloadCombinedDocument.mockResolvedValue(Buffer.from("signed-pdf"));
      storage.save.mockResolvedValue({ storageKey: "key-1", size: 10 });
      prisma.contract.update.mockResolvedValue({ id: "c1", status: "signed" });

      await service.refreshDocusignStatus(COMPANY_A, "c1");

      expect(storage.save).toHaveBeenCalledWith(COMPANY_A, "docusign-signed.pdf", Buffer.from("signed-pdf"));
      expect(prisma.contract.update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: {
          status: "signed",
          docusignStatus: "completed",
          docusignSignedPdfKey: "key-1",
          signerName: "Acme Corp",
          signedAt: new Date("2026-09-16T10:00:00Z"),
        },
      });
    });

    it("doesn't re-download or re-record once the contract is already signed", async () => {
      prisma.contract.findFirst.mockResolvedValue({ id: "c1", companyId: COMPANY_A, status: "signed", docusignEnvelopeId: "env-1" });
      docusign.getConnectionOrThrow.mockResolvedValue({ accountId: "acct-1" });
      docusign.getEnvelopeStatus.mockResolvedValue({ status: "completed", completedAt: "2026-09-16T10:00:00Z" });

      await service.refreshDocusignStatus(COMPANY_A, "c1");

      expect(docusign.downloadCombinedDocument).not.toHaveBeenCalled();
    });

    it("voids the contract when the signer declines the envelope", async () => {
      prisma.contract.findFirst.mockResolvedValue({ id: "c1", companyId: COMPANY_A, status: "sent", title: "MSA", docusignEnvelopeId: "env-1" });
      docusign.getConnectionOrThrow.mockResolvedValue({ accountId: "acct-1" });
      docusign.getEnvelopeStatus.mockResolvedValue({ status: "declined", completedAt: null });
      prisma.contract.update.mockResolvedValue({ id: "c1", status: "void" });

      await service.refreshDocusignStatus(COMPANY_A, "c1");

      expect(prisma.contract.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { status: "void", docusignStatus: "declined" } });
      expect(audit.record).toHaveBeenCalledWith(COMPANY_A, { name: "DocuSign" }, "contract.voided", "Contract", "c1", expect.stringContaining("declined"));
    });

    it("voids the contract when the envelope is voided in DocuSign", async () => {
      prisma.contract.findFirst.mockResolvedValue({ id: "c1", companyId: COMPANY_A, status: "sent", title: "MSA", docusignEnvelopeId: "env-1" });
      docusign.getConnectionOrThrow.mockResolvedValue({ accountId: "acct-1" });
      docusign.getEnvelopeStatus.mockResolvedValue({ status: "voided", completedAt: null });
      prisma.contract.update.mockResolvedValue({ id: "c1", status: "void" });

      await service.refreshDocusignStatus(COMPANY_A, "c1");

      expect(prisma.contract.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { status: "void", docusignStatus: "voided" } });
    });

    it("doesn't re-void a contract that's already void", async () => {
      prisma.contract.findFirst.mockResolvedValue({ id: "c1", companyId: COMPANY_A, status: "void", title: "MSA", docusignEnvelopeId: "env-1" });
      docusign.getConnectionOrThrow.mockResolvedValue({ accountId: "acct-1" });
      docusign.getEnvelopeStatus.mockResolvedValue({ status: "voided", completedAt: null });

      await service.refreshDocusignStatus(COMPANY_A, "c1");

      expect(prisma.contract.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { docusignStatus: "voided" } });
      expect(audit.record).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "contract.voided", expect.anything(), expect.anything(), expect.anything());
    });
  });

  describe("getDocusignSignedPdf()", () => {
    it("throws when no DocuSign-signed document is on file", async () => {
      prisma.contract.findFirst.mockResolvedValue({ id: "c1", companyId: COMPANY_A, docusignSignedPdfKey: null });

      await expect(service.getDocusignSignedPdf(COMPANY_A, "c1")).rejects.toThrow(NotFoundException);
    });

    it("reads the stored document", async () => {
      prisma.contract.findFirst.mockResolvedValue({ id: "c1", companyId: COMPANY_A, docusignSignedPdfKey: "key-1" });
      storage.read.mockResolvedValue(Buffer.from("signed-pdf"));

      const result = await service.getDocusignSignedPdf(COMPANY_A, "c1");

      expect(storage.read).toHaveBeenCalledWith("key-1");
      expect(result).toEqual(Buffer.from("signed-pdf"));
    });
  });

  describe("sign()", () => {
    it("rejects an unknown token", async () => {
      prisma.contract.findFirst.mockResolvedValue(null);

      await expect(service.sign("bad-token", { signerName: "Jane", signatureDataUrl: "data:image/png;base64,AAAA" })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("rejects signing a contract that isn't awaiting signature", async () => {
      prisma.contract.findFirst.mockResolvedValue({ id: "c1", companyId: COMPANY_A, status: "draft" });

      await expect(
        service.sign("tok-abc", { signerName: "Jane", signatureDataUrl: "data:image/png;base64,AAAA" }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.contract.update).not.toHaveBeenCalled();
    });

    it("stores the signature and marks the contract signed", async () => {
      prisma.contract.findFirst.mockResolvedValue({ id: "c1", companyId: COMPANY_A, status: "sent", title: "MSA" });
      storage.save.mockResolvedValue({ storageKey: `${COMPANY_A}/signature.png` });
      prisma.contract.update.mockResolvedValue({ id: "c1", status: "signed" });

      const result = await service.sign(
        "tok-abc",
        { signerName: "Jane Client", signatureDataUrl: "data:image/png;base64,AAAA" },
        "203.0.113.5",
      );

      expect(result).toEqual({ status: "signed" });
      expect(prisma.contract.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "signed", signerName: "Jane Client", signedIp: "203.0.113.5" }),
        }),
      );
    });
  });

  describe("void()", () => {
    it("rejects voiding an already-void contract", async () => {
      prisma.contract.findFirst.mockResolvedValue({ id: "c1", companyId: COMPANY_A, status: "void", title: "MSA" });

      await expect(service.void(COMPANY_A, ACTOR, "c1")).rejects.toThrow(BadRequestException);
      expect(prisma.contract.update).not.toHaveBeenCalled();
    });
  });
});
