import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ServiceContractsService } from "./service-contracts.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("ServiceContractsService", () => {
  let service: ServiceContractsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    client: { findFirst: jest.Mock };
    serviceContract: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      client: { findFirst: jest.fn() },
      serviceContract: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [ServiceContractsService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: { record: jest.fn() } }],
    }).compile();

    service = module.get(ServiceContractsService);
  });

  describe("create", () => {
    it("rejects a project from another company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      prisma.client.findFirst.mockResolvedValue({ id: "client-1" });

      await expect(
        service.create(COMPANY_A, ACTOR, {
          projectId: "project-1",
          clientId: "client-1",
          title: "HVAC",
          frequencyMonths: 3,
          startDate: "2026-06-01T00:00:00.000Z",
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it("seeds nextVisitDate from startDate on creation", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      prisma.client.findFirst.mockResolvedValue({ id: "client-1" });
      prisma.serviceContract.create.mockResolvedValue({ id: "contract-1" });

      await service.create(COMPANY_A, ACTOR, {
        projectId: "project-1",
        clientId: "client-1",
        title: "HVAC",
        frequencyMonths: 3,
        startDate: "2026-06-01T00:00:00.000Z",
      });

      expect(prisma.serviceContract.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            startDate: new Date("2026-06-01T00:00:00.000Z"),
            nextVisitDate: new Date("2026-06-01T00:00:00.000Z"),
          }),
        }),
      );
    });
  });

  describe("get", () => {
    it("throws for a contract outside this company", async () => {
      prisma.serviceContract.findFirst.mockResolvedValue(null);
      await expect(service.get(COMPANY_A, "contract-1")).rejects.toThrow(NotFoundException);
    });
  });
});
