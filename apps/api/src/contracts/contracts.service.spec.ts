import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { ContractsService } from "./contracts.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Jane" };

describe("ContractsService", () => {
  let service: ContractsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    client: { findFirst: jest.Mock };
    subcontractor: { findFirst: jest.Mock };
    contractTemplate: { findFirst: jest.Mock };
    contract: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
  };
  let storage: { save: jest.Mock; read: jest.Mock };
  let mail: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      client: { findFirst: jest.fn() },
      subcontractor: { findFirst: jest.fn() },
      contractTemplate: { findFirst: jest.fn() },
      contract: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
    };
    storage = { save: jest.fn(), read: jest.fn() };
    mail = { send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PdfService, useValue: { renderTextDocument: jest.fn() } },
        { provide: StorageService, useValue: storage },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: MailService, useValue: mail },
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
