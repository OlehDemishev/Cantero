import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { CrewSmsBroadcastService } from "./crew-sms-broadcast.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { SmsService } from "../common/sms/sms.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("CrewSmsBroadcastService", () => {
  let service: CrewSmsBroadcastService;
  let prisma: {
    project: { findFirst: jest.Mock };
    worker: { findMany: jest.Mock };
    crewSmsBroadcast: { create: jest.Mock; findMany: jest.Mock };
  };
  let sms: { send: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      worker: { findMany: jest.fn() },
      crewSmsBroadcast: { create: jest.fn(), findMany: jest.fn() },
    };
    sms = { send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        CrewSmsBroadcastService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: SmsService, useValue: sms },
      ],
    }).compile();

    service = module.get(CrewSmsBroadcastService);
  });

  it("404s when broadcasting to a project outside the company", async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(service.send(COMPANY_A, ACTOR, { message: "hi", projectId: "proj-1" })).rejects.toThrow(NotFoundException);
  });

  it("rejects when no crew member has a phone number on file", async () => {
    prisma.worker.findMany.mockResolvedValue([]);
    await expect(service.send(COMPANY_A, ACTOR, { message: "Site closed tomorrow" })).rejects.toThrow(BadRequestException);
    expect(sms.send).not.toHaveBeenCalled();
  });

  it("texts every matching worker and logs the broadcast with an accurate recipient count", async () => {
    prisma.worker.findMany.mockResolvedValue([{ phone: "+15551234567" }, { phone: "+15557654321" }]);
    prisma.crewSmsBroadcast.create.mockResolvedValue({ id: "b-1", recipientCount: 2 });

    const result = await service.send(COMPANY_A, ACTOR, { message: "Site closed tomorrow due to weather" });

    expect(sms.send).toHaveBeenCalledTimes(2);
    expect(sms.send).toHaveBeenCalledWith({ to: "+15551234567", body: "Site closed tomorrow due to weather" });
    expect(prisma.crewSmsBroadcast.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ recipientCount: 2, message: "Site closed tomorrow due to weather" }) }),
    );
    expect(result).toEqual({ id: "b-1", recipientCount: 2 });
  });

  it("scopes the worker query to a project's current assignments when projectId is given", async () => {
    prisma.project.findFirst.mockResolvedValue({ id: "proj-1" });
    prisma.worker.findMany.mockResolvedValue([{ phone: "+15551234567" }]);
    prisma.crewSmsBroadcast.create.mockResolvedValue({ id: "b-1" });

    await service.send(COMPANY_A, ACTOR, { message: "hi", projectId: "proj-1" });

    const call = prisma.worker.findMany.mock.calls[0][0];
    expect(call.where.resourceAssignments.some.projectId).toBe("proj-1");
  });
});
