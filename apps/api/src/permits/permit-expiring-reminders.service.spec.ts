import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { PermitExpiringRemindersService } from "./permit-expiring-reminders.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { PERMIT_EXPIRING_QUEUE } from "../common/queue/queue.module";

const COMPANY_A = "company-a";

describe("PermitExpiringRemindersService.runDuePass", () => {
  let service: PermitExpiringRemindersService;
  let prisma: {
    permit: { findMany: jest.Mock; update: jest.Mock };
    membership: { findMany: jest.Mock };
  };
  let mail: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      permit: { findMany: jest.fn(), update: jest.fn() },
      membership: { findMany: jest.fn().mockResolvedValue([{ user: { email: "owner@example.com" } }]) },
    };
    mail = { send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        PermitExpiringRemindersService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: getQueueToken(PERMIT_EXPIRING_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(PermitExpiringRemindersService);
  });

  it("notifies owners and marks the permit as notified", async () => {
    prisma.permit.findMany.mockResolvedValue([
      {
        id: "permit-1",
        companyId: COMPANY_A,
        projectId: "project-1",
        permitType: "Building",
        permitNumber: "B-123",
        expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        company: { name: "Acme" },
        project: { name: "Riverside" },
      },
    ]);

    const result = await service.runDuePass();

    expect(result.notified).toBe(1);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0].subject).toContain("B-123");
    expect(prisma.permit.update).toHaveBeenCalledWith({ where: { id: "permit-1" }, data: { expiringNotifiedAt: expect.any(Date) } });
  });

  it("queries only not-yet-notified, non-terminal permits within the lookahead window", async () => {
    prisma.permit.findMany.mockResolvedValue([]);

    await service.runDuePass();

    expect(prisma.permit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          expiringNotifiedAt: null,
          status: { notIn: ["expired", "rejected"] },
        }),
      }),
    );
  });
});
