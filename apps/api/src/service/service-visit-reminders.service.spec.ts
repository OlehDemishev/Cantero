import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { ServiceVisitRemindersService } from "./service-visit-reminders.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { SERVICE_VISIT_REMINDERS_QUEUE } from "../common/queue/queue.module";

const COMPANY_A = "company-a";

function dueContract(overrides: Record<string, unknown> = {}) {
  return {
    id: "contract-1",
    companyId: COMPANY_A,
    title: "HVAC quarterly maintenance",
    nextVisitDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    company: { id: COMPANY_A, name: "Acme" },
    project: { name: "Main Street Office" },
    ...overrides,
  };
}

describe("ServiceVisitRemindersService", () => {
  let service: ServiceVisitRemindersService;
  let prisma: {
    serviceContract: { findMany: jest.Mock };
    membership: { findMany: jest.Mock };
  };
  let mail: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      serviceContract: { findMany: jest.fn() },
      membership: { findMany: jest.fn() },
    };
    mail = { send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ServiceVisitRemindersService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: getQueueToken(SERVICE_VISIT_REMINDERS_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(ServiceVisitRemindersService);
  });

  it("notifies zero when no contracts are due", async () => {
    prisma.serviceContract.findMany.mockResolvedValue([]);

    const result = await service.runDuePass();

    expect(result.notified).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("filters to active contracts due within the 14-day lookahead", async () => {
    prisma.serviceContract.findMany.mockResolvedValue([]);

    await service.runDuePass();

    const where = prisma.serviceContract.findMany.mock.calls[0][0].where;
    expect(where.active).toBe(true);
    expect(where.nextVisitDate.lte).toBeInstanceOf(Date);
    expect(where.nextVisitDate.lte.getTime()).toBeGreaterThan(Date.now());
  });

  it("skips a contract with no owner to notify, without crashing the pass", async () => {
    prisma.serviceContract.findMany.mockResolvedValue([dueContract()]);
    prisma.membership.findMany.mockResolvedValue([]);

    const result = await service.runDuePass();

    expect(result.notified).toBe(0);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("emails every owner of the company and counts the contract once", async () => {
    prisma.serviceContract.findMany.mockResolvedValue([dueContract()]);
    prisma.membership.findMany.mockResolvedValue([
      { user: { email: "owner1@example.com" } },
      { user: { email: "owner2@example.com" } },
    ]);

    const result = await service.runDuePass();

    expect(result.notified).toBe(1);
    expect(mail.send).toHaveBeenCalledTimes(2);
    expect(mail.send.mock.calls[0][0].to).toBe("owner1@example.com");
    expect(mail.send.mock.calls[1][0].to).toBe("owner2@example.com");
    expect(mail.send.mock.calls[0][0].subject).toContain("HVAC quarterly maintenance");
    expect(mail.send.mock.calls[0][0].text).toContain("Main Street Office");
  });

  it("scopes the owner lookup to the contract's own company", async () => {
    prisma.serviceContract.findMany.mockResolvedValue([dueContract()]);
    prisma.membership.findMany.mockResolvedValue([{ user: { email: "owner@example.com" } }]);

    await service.runDuePass();

    expect(prisma.membership.findMany).toHaveBeenCalledWith({
      where: { companyId: COMPANY_A, role: "owner" },
      include: { user: { select: { email: true } } },
    });
  });

  it("sums notified across multiple due contracts", async () => {
    prisma.serviceContract.findMany.mockResolvedValue([
      dueContract({ id: "contract-1" }),
      dueContract({ id: "contract-2" }),
    ]);
    prisma.membership.findMany.mockResolvedValue([{ user: { email: "owner@example.com" } }]);

    const result = await service.runDuePass();

    expect(result.notified).toBe(2);
  });
});
