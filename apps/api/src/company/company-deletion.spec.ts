import { Test } from "@nestjs/testing";
import { CompanyService } from "./company.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";
import { MailService } from "../common/mail/mail.service";
import { ExchangeRateService } from "../common/exchange-rate/exchange-rate.service";

describe("CompanyService — deletion request", () => {
  let service: CompanyService;
  let prisma: { company: { update: jest.Mock } };
  let audit: { record: jest.Mock };
  let mail: { send: jest.Mock };

  beforeEach(async () => {
    prisma = { company: { update: jest.fn() } };
    audit = { record: jest.fn() };
    mail = { send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        CompanyService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: {} },
        { provide: AuditService, useValue: audit },
        { provide: MailService, useValue: mail },
        { provide: ExchangeRateService, useValue: {} },
      ],
    }).compile();

    service = module.get(CompanyService);
  });

  it("stamps deletionRequestedAt/By, audits, and emails the requester", async () => {
    prisma.company.update.mockResolvedValue({ id: "company-a", name: "Acme", deletionRequestedAt: new Date() });

    await service.requestDeletion("company-a", { userId: "user-1", name: "Jane" }, "jane@example.com");

    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: "company-a" },
      data: { deletionRequestedAt: expect.any(Date), deletionRequestedByUserId: "user-1" },
    });
    expect(audit.record).toHaveBeenCalledWith(
      "company-a",
      { userId: "user-1", name: "Jane" },
      "company.deletion_requested",
      "Company",
      "company-a",
      expect.any(String),
    );
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0].to).toBe("jane@example.com");
  });

  it("clears the request on cancel and audits it", async () => {
    prisma.company.update.mockResolvedValue({ id: "company-a", deletionRequestedAt: null });

    await service.cancelDeletionRequest("company-a", { userId: "user-1", name: "Jane" });

    expect(prisma.company.update).toHaveBeenCalledWith({
      where: { id: "company-a" },
      data: { deletionRequestedAt: null, deletionRequestedByUserId: null },
    });
    expect(audit.record).toHaveBeenCalledWith(
      "company-a",
      { userId: "user-1", name: "Jane" },
      "company.deletion_request_cancelled",
      "Company",
      "company-a",
      expect.any(String),
    );
    expect(mail.send).not.toHaveBeenCalled();
  });
});
