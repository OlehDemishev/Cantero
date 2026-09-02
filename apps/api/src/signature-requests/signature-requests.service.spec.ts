import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { SignatureRequestsService } from "./signature-requests.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { MailService } from "../common/mail/mail.service";
import { AuditService } from "../common/audit/audit.service";
import { WebhooksService } from "../common/webhooks/webhooks.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Ana" };
const SIGNATURE_DATA_URL = "data:image/png;base64,aGVsbG8=";

function signer(overrides: Partial<{ id: string; order: number; signedAt: Date | null; email: string; accessToken: string; name: string }>) {
  return {
    id: "signer-1",
    signatureRequestId: "req-1",
    order: 1,
    name: "Jane",
    email: "jane@example.com",
    accessToken: "token-1",
    notifiedAt: null,
    signedAt: null,
    signatureImageKey: null,
    signedIp: null,
    ...overrides,
  };
}

describe("SignatureRequestsService", () => {
  let service: SignatureRequestsService;
  let prisma: {
    document: { findFirst: jest.Mock };
    signatureRequest: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    signatureRequestSigner: { findUnique: jest.Mock; update: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
  };
  let storage: { save: jest.Mock; read: jest.Mock };
  let mail: { send: jest.Mock };
  let webhooks: { trigger: jest.Mock };

  beforeEach(async () => {
    prisma = {
      document: { findFirst: jest.fn() },
      signatureRequest: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      signatureRequestSigner: { findUnique: jest.fn(), update: jest.fn() },
      company: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: "Acme Co" }) },
    };
    storage = { save: jest.fn().mockResolvedValue({ storageKey: "sig-key" }), read: jest.fn() };
    mail = { send: jest.fn() };
    webhooks = { trigger: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SignatureRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: WebhooksService, useValue: webhooks },
      ],
    }).compile();

    service = module.get(SignatureRequestsService);
  });

  describe("create()", () => {
    it("rejects when the document does not belong to this company", async () => {
      prisma.document.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, { documentId: "doc-1", title: "NDA", signers: [{ name: "Jane", email: "jane@example.com" }] }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.signatureRequest.create).not.toHaveBeenCalled();
    });

    it("assigns sequential order to each signer", async () => {
      prisma.document.findFirst.mockResolvedValue({ id: "doc-1" });
      prisma.signatureRequest.create.mockResolvedValue({ id: "req-1" });

      await service.create(COMPANY_A, ACTOR, {
        documentId: "doc-1",
        title: "NDA",
        signers: [
          { name: "Jane", email: "jane@example.com" },
          { name: "Bob", email: "bob@example.com" },
        ],
      });

      const call = prisma.signatureRequest.create.mock.calls[0][0];
      expect(call.data.signers.create).toEqual([
        expect.objectContaining({ order: 1, name: "Jane" }),
        expect.objectContaining({ order: 2, name: "Bob" }),
      ]);
    });
  });

  describe("sign()", () => {
    it("rejects when the signer token doesn't resolve", async () => {
      prisma.signatureRequestSigner.findUnique.mockResolvedValue(null);

      await expect(service.sign("bad-token", { signatureDataUrl: SIGNATURE_DATA_URL })).rejects.toThrow(NotFoundException);
    });

    it("rejects signing out of turn", async () => {
      const secondSigner = signer({ id: "signer-2", order: 2, accessToken: "token-2" });
      prisma.signatureRequestSigner.findUnique.mockResolvedValue({
        ...secondSigner,
        signatureRequest: {
          companyId: COMPANY_A,
          status: "sent",
          title: "NDA",
          signers: [signer({ signedAt: null }), secondSigner],
        },
      });

      await expect(service.sign("token-2", { signatureDataUrl: SIGNATURE_DATA_URL })).rejects.toThrow(BadRequestException);
      expect(storage.save).not.toHaveBeenCalled();
    });

    it("rejects re-signing", async () => {
      const already = signer({ signedAt: new Date() });
      prisma.signatureRequestSigner.findUnique.mockResolvedValue({
        ...already,
        signatureRequest: { companyId: COMPANY_A, status: "sent", title: "NDA", signers: [already] },
      });

      await expect(service.sign("token-1", { signatureDataUrl: SIGNATURE_DATA_URL })).rejects.toThrow(BadRequestException);
    });

    it("notifies the next signer in order rather than completing the request", async () => {
      const first = signer({ id: "signer-1", order: 1, accessToken: "token-1" });
      const second = signer({ id: "signer-2", order: 2, accessToken: "token-2", email: "bob@example.com", name: "Bob" });
      prisma.signatureRequestSigner.findUnique.mockResolvedValue({
        ...first,
        signatureRequestId: "req-1",
        signatureRequest: { companyId: COMPANY_A, status: "sent", title: "NDA", signers: [first, second] },
      });

      const result = await service.sign("token-1", { signatureDataUrl: SIGNATURE_DATA_URL }, "1.2.3.4");

      expect(result).toEqual({ status: "sent" });
      expect(prisma.signatureRequestSigner.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "signer-1" }, data: expect.objectContaining({ signatureImageKey: "sig-key" }) }),
      );
      expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: "bob@example.com" }));
      expect(prisma.signatureRequest.update).not.toHaveBeenCalled();
      expect(webhooks.trigger).not.toHaveBeenCalled();
    });

    it("marks the request completed once the last signer signs", async () => {
      const only = signer({ id: "signer-1", order: 1, accessToken: "token-1" });
      prisma.signatureRequestSigner.findUnique.mockResolvedValue({
        ...only,
        signatureRequestId: "req-1",
        signatureRequest: { companyId: COMPANY_A, status: "sent", title: "NDA", signers: [only] },
      });

      const result = await service.sign("token-1", { signatureDataUrl: SIGNATURE_DATA_URL });

      expect(result).toEqual({ status: "completed" });
      expect(prisma.signatureRequest.update).toHaveBeenCalledWith({
        where: { id: "req-1" },
        data: expect.objectContaining({ status: "completed" }),
      });
      expect(webhooks.trigger).toHaveBeenCalledWith(COMPANY_A, "signature_request.completed", { signatureRequestId: "req-1" });
    });
  });

  describe("send()", () => {
    it("rejects sending a non-draft request", async () => {
      prisma.signatureRequest.findFirst.mockResolvedValue({ id: "req-1", status: "sent" });

      await expect(service.send(COMPANY_A, ACTOR, "req-1")).rejects.toThrow(BadRequestException);
    });

    it("emails only the first signer", async () => {
      const first = signer({ id: "signer-1", order: 1, email: "jane@example.com" });
      const second = signer({ id: "signer-2", order: 2, email: "bob@example.com" });
      prisma.signatureRequest.findFirst.mockResolvedValue({ id: "req-1", status: "draft", title: "NDA", signers: [first, second] });
      prisma.signatureRequest.update.mockResolvedValue({ id: "req-1", status: "sent", title: "NDA", signers: [first, second] });

      await service.send(COMPANY_A, ACTOR, "req-1");

      expect(mail.send).toHaveBeenCalledTimes(1);
      expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: "jane@example.com" }));
    });
  });
});
