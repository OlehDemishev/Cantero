import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { LeadsService } from "./leads.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { OutboxService } from "../common/webhooks/outbox.service";
import { StorageService } from "../common/storage/storage.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Owner" };

describe("LeadsService", () => {
  let service: LeadsService;
  let prisma: {
    company: { update: jest.Mock; findUnique: jest.Mock };
    client: { create: jest.Mock };
    document: { findMany: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { record: jest.Mock };
  let outbox: { enqueue: jest.Mock };
  let storage: { read: jest.Mock };

  beforeEach(async () => {
    prisma = {
      company: { update: jest.fn(), findUnique: jest.fn() },
      client: { create: jest.fn() },
      document: { findMany: jest.fn(), findFirst: jest.fn() },
      $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    };
    audit = { record: jest.fn() };
    outbox = { enqueue: jest.fn() };
    storage = { read: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: OutboxService, useValue: outbox },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    service = module.get(LeadsService);
  });

  describe("getFormInfo() / submitLead()", () => {
    it("rejects an unknown or disabled form token", async () => {
      prisma.company.findUnique.mockResolvedValue(null);

      await expect(service.getFormInfo("bad-token")).rejects.toThrow(NotFoundException);
      await expect(service.submitLead("bad-token", { name: "Jane" })).rejects.toThrow(NotFoundException);
      expect(prisma.client.create).not.toHaveBeenCalled();
    });

    it("creates a lead client scoped to the company that owns the token", async () => {
      prisma.company.findUnique.mockResolvedValue({ id: COMPANY_A });
      prisma.client.create.mockResolvedValue({ id: "client-1", name: "Jane Doe" });

      await service.submitLead("good-token", { name: "Jane Doe", email: "jane@example.com", message: "Need a quote" });

      expect(prisma.client.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ companyId: COMPANY_A, name: "Jane Doe", email: "jane@example.com", notes: "Need a quote" }),
        }),
      );
      expect(outbox.enqueue).toHaveBeenCalledWith(prisma, COMPANY_A, "client.lead_captured", expect.objectContaining({ clientId: "client-1" }));
    });

    it("silently drops a submission with a filled honeypot, without creating a client or firing a webhook", async () => {
      prisma.company.findUnique.mockResolvedValue({ id: COMPANY_A });

      const result = await service.submitLead("good-token", { name: "Bot", honeypot: "I am a bot" });

      expect(result).toEqual({ ok: true });
      expect(prisma.client.create).not.toHaveBeenCalled();
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });
  });

  describe("regenerateFormToken()", () => {
    it("sets a fresh random token on the company", async () => {
      await service.regenerateFormToken(COMPANY_A, ACTOR);

      expect(prisma.company.update).toHaveBeenCalledWith({
        where: { id: COMPANY_A },
        data: { publicLeadFormToken: expect.any(String) },
      });
    });
  });

  describe("getFormInfo() showcase", () => {
    it("returns branding and a list of gallery_after photos scoped to the company", async () => {
      prisma.company.findUnique.mockResolvedValue({ id: COMPANY_A, name: "Acme Co", brandColor: "#465fff", logoStorageKey: "logo.png" });
      prisma.document.findMany.mockResolvedValue([{ id: "doc-1", project: { name: "Site A" } }]);

      const result = await service.getFormInfo("good-token");

      expect(result).toEqual({
        companyName: "Acme Co",
        brandColor: "#465fff",
        hasLogo: true,
        photos: [{ id: "doc-1", projectName: "Site A" }],
      });
      const call = prisma.document.findMany.mock.calls[0][0];
      expect(call.where).toEqual({ companyId: COMPANY_A, category: "gallery_after" });
    });

    it("reports hasLogo: false when no logo is uploaded", async () => {
      prisma.company.findUnique.mockResolvedValue({ id: COMPANY_A, name: "Acme Co", brandColor: null, logoStorageKey: null });
      prisma.document.findMany.mockResolvedValue([]);

      const result = await service.getFormInfo("good-token");

      expect(result.hasLogo).toBe(false);
    });
  });

  describe("getShowcasePhoto()", () => {
    it("404s on an unknown token", async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      await expect(service.getShowcasePhoto("bad-token", "doc-1")).rejects.toThrow(NotFoundException);
    });

    it("404s when the document isn't a gallery_after photo in this company — never fetches arbitrary documents", async () => {
      prisma.company.findUnique.mockResolvedValue({ id: COMPANY_A });
      prisma.document.findFirst.mockResolvedValue(null);

      await expect(service.getShowcasePhoto("good-token", "doc-1")).rejects.toThrow(NotFoundException);

      const call = prisma.document.findFirst.mock.calls[0][0];
      expect(call.where).toEqual({ id: "doc-1", companyId: COMPANY_A, category: "gallery_after" });
    });

    it("streams the photo bytes for a valid showcase document", async () => {
      prisma.company.findUnique.mockResolvedValue({ id: COMPANY_A });
      prisma.document.findFirst.mockResolvedValue({ storageKey: "key.jpg", mimeType: "image/jpeg", name: "site.jpg" });
      storage.read.mockResolvedValue(Buffer.from("fake-image-bytes"));

      const result = await service.getShowcasePhoto("good-token", "doc-1");

      expect(storage.read).toHaveBeenCalledWith("key.jpg");
      expect(result.mimeType).toBe("image/jpeg");
    });
  });
});
