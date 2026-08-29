import { Test } from "@nestjs/testing";
import { getQueueToken } from "@nestjs/bullmq";
import { ConfigService } from "@nestjs/config";
import { EquipmentMaintenanceSchedulerService } from "./equipment-maintenance-scheduler.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { AuditService } from "../common/audit/audit.service";
import { EQUIPMENT_MAINTENANCE_QUEUE } from "../common/queue/queue.module";

const COMPANY_A = "company-a";

describe("EquipmentMaintenanceSchedulerService", () => {
  let service: EquipmentMaintenanceSchedulerService;
  let prisma: {
    equipment: { findMany: jest.Mock; update: jest.Mock };
    membership: { findMany: jest.Mock };
  };
  let mail: { send: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      equipment: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
      membership: { findMany: jest.fn().mockResolvedValue([{ user: { email: "owner@example.com" } }]) },
    };
    mail = { send: jest.fn() };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        EquipmentMaintenanceSchedulerService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mail },
        { provide: AuditService, useValue: audit },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(undefined) } },
        { provide: getQueueToken(EQUIPMENT_MAINTENANCE_QUEUE), useValue: { add: jest.fn() } },
      ],
    }).compile();

    service = module.get(EquipmentMaintenanceSchedulerService);
  });

  describe("runDuePass()", () => {
    it("auto-transitions overdue available equipment to maintenance and emails the owner", async () => {
      prisma.equipment.findMany.mockResolvedValue([
        { id: "eq-1", companyId: COMPANY_A, name: "Excavator", status: "available", maintenanceOverdueNotifiedAt: null, company: { name: "Acme" } },
      ]);

      const result = await service.runDuePass();

      expect(result.flagged).toBe(1);
      expect(prisma.equipment.update).toHaveBeenCalledWith({ where: { id: "eq-1" }, data: { status: "maintenance" } });
      expect(mail.send).toHaveBeenCalledTimes(1);
      expect(mail.send.mock.calls[0][0].subject).toContain("Excavator");
    });

    it("doesn't force a status change on in-use equipment, but does notify once", async () => {
      prisma.equipment.findMany.mockResolvedValue([
        { id: "eq-1", companyId: COMPANY_A, name: "Crane", status: "in_use", maintenanceOverdueNotifiedAt: null, company: { name: "Acme" } },
      ]);

      const result = await service.runDuePass();

      expect(result.flagged).toBe(1);
      expect(prisma.equipment.update).toHaveBeenCalledWith({
        where: { id: "eq-1" },
        data: { maintenanceOverdueNotifiedAt: expect.any(Date) },
      });
      expect(mail.send).toHaveBeenCalledTimes(1);
    });

    it("doesn't re-notify in-use equipment that was already flagged on a prior pass", async () => {
      prisma.equipment.findMany.mockResolvedValue([
        {
          id: "eq-1",
          companyId: COMPANY_A,
          name: "Crane",
          status: "in_use",
          maintenanceOverdueNotifiedAt: new Date(),
          company: { name: "Acme" },
        },
      ]);

      const result = await service.runDuePass();

      expect(result.flagged).toBe(0);
      expect(mail.send).not.toHaveBeenCalled();
      expect(prisma.equipment.update).not.toHaveBeenCalled();
    });

    it("auto-transitions available equipment whose meter reading has reached its hour-based threshold", async () => {
      prisma.equipment.findMany
        .mockResolvedValueOnce([]) // date-overdue query
        .mockResolvedValueOnce([
          {
            id: "eq-1",
            companyId: COMPANY_A,
            name: "Compressor",
            status: "available",
            currentMeterHours: 500,
            nextMaintenanceDueHours: 500,
            maintenanceOverdueHoursNotifiedAt: null,
            company: { name: "Acme" },
          },
        ]);

      const result = await service.runDuePass();

      expect(result.flagged).toBe(1);
      expect(prisma.equipment.update).toHaveBeenCalledWith({ where: { id: "eq-1" }, data: { status: "maintenance" } });
      expect(mail.send).toHaveBeenCalledTimes(1);
    });

    it("leaves equipment below its hour-based threshold alone", async () => {
      prisma.equipment.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          id: "eq-1",
          companyId: COMPANY_A,
          name: "Compressor",
          status: "available",
          currentMeterHours: 250,
          nextMaintenanceDueHours: 500,
          maintenanceOverdueHoursNotifiedAt: null,
          company: { name: "Acme" },
        },
      ]);

      const result = await service.runDuePass();

      expect(result.flagged).toBe(0);
      expect(prisma.equipment.update).not.toHaveBeenCalled();
    });

    it("notifies independently for date and hours overdue on the same in-use equipment", async () => {
      prisma.equipment.findMany
        .mockResolvedValueOnce([
          {
            id: "eq-1",
            companyId: COMPANY_A,
            name: "Crane",
            status: "in_use",
            maintenanceOverdueNotifiedAt: new Date(), // already notified for the date reason
            maintenanceOverdueHoursNotifiedAt: null,
            company: { name: "Acme" },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: "eq-1",
            companyId: COMPANY_A,
            name: "Crane",
            status: "in_use",
            currentMeterHours: 800,
            nextMaintenanceDueHours: 800,
            maintenanceOverdueNotifiedAt: new Date(),
            maintenanceOverdueHoursNotifiedAt: null, // not yet notified for the hours reason
            company: { name: "Acme" },
          },
        ]);

      const result = await service.runDuePass();

      // Still notifies once (for the not-yet-flagged hours reason), even though the date reason was already flagged.
      expect(result.flagged).toBe(1);
      expect(prisma.equipment.update).toHaveBeenCalledWith({
        where: { id: "eq-1" },
        data: { maintenanceOverdueNotifiedAt: undefined, maintenanceOverdueHoursNotifiedAt: expect.any(Date) },
      });
    });
  });
});
