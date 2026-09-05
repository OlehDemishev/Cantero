import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { TransmittalsService } from "./transmittals.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const PROJECT_A = "project-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("TransmittalsService", () => {
  let service: TransmittalsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    transmittal: { findMany: jest.Mock; findFirst: jest.Mock; count: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      transmittal: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [TransmittalsService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(TransmittalsService);
  });

  describe("create()", () => {
    it("rejects a transmittal for a project that doesn't belong to the company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, PROJECT_A, {
          recipientName: "Acme Architects",
          method: "email",
          items: [{ description: "Drawing A-101 Rev 3", quantity: 1 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("numbers a new transmittal sequentially per project", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A, name: "Tower" });
      prisma.transmittal.count.mockResolvedValue(2);
      prisma.transmittal.create.mockResolvedValue({ id: "t-3", number: 3 });

      await service.create(COMPANY_A, ACTOR, PROJECT_A, {
        recipientName: "Acme Architects",
        method: "email",
        items: [{ description: "Drawing A-101 Rev 3", quantity: 1 }],
      });

      expect(prisma.transmittal.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ number: 3 }) }),
      );
    });

    it("creates nested transmittal items", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A, name: "Tower" });
      prisma.transmittal.count.mockResolvedValue(0);
      prisma.transmittal.create.mockResolvedValue({ id: "t-1", number: 1 });

      await service.create(COMPANY_A, ACTOR, PROJECT_A, {
        recipientName: "Acme Architects",
        method: "portal",
        items: [
          { description: "Drawing A-101 Rev 3", quantity: 1 },
          { description: "Submittal SUB-004", quantity: 2 },
        ],
      });

      const createCall = prisma.transmittal.create.mock.calls[0][0];
      expect(createCall.data.items.create).toEqual([
        { description: "Drawing A-101 Rev 3", quantity: 1 },
        { description: "Submittal SUB-004", quantity: 2 },
      ]);
    });
  });

  describe("acknowledge()", () => {
    it("throws when the transmittal doesn't belong to the company", async () => {
      prisma.transmittal.findFirst.mockResolvedValue(null);
      await expect(service.acknowledge(COMPANY_A, ACTOR, "t-1", { acknowledgedByName: "Jane" })).rejects.toThrow(NotFoundException);
    });

    it("rejects acknowledging a transmittal twice", async () => {
      prisma.transmittal.findFirst.mockResolvedValue({ id: "t-1", number: 1, acknowledgedAt: new Date() });
      await expect(service.acknowledge(COMPANY_A, ACTOR, "t-1", { acknowledgedByName: "Jane" })).rejects.toThrow(BadRequestException);
    });

    it("stamps acknowledgedAt and acknowledgedByName", async () => {
      prisma.transmittal.findFirst.mockResolvedValue({ id: "t-1", number: 1, acknowledgedAt: null });
      prisma.transmittal.update.mockResolvedValue({ id: "t-1", acknowledgedAt: new Date(), acknowledgedByName: "Jane" });

      const result = await service.acknowledge(COMPANY_A, ACTOR, "t-1", { acknowledgedByName: "Jane" });

      expect(result.acknowledgedByName).toBe("Jane");
      const updateCall = prisma.transmittal.update.mock.calls[0][0];
      expect(updateCall.data.acknowledgedAt).toBeInstanceOf(Date);
    });
  });
});
