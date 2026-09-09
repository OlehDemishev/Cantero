import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CalendarFeedService } from "./calendar-feed.service";
import { PrismaService } from "../common/prisma/prisma.service";

describe("CalendarFeedService", () => {
  let service: CalendarFeedService;
  let prisma: {
    company: { findUnique: jest.Mock };
    task: { findMany: jest.Mock };
    milestone: { findMany: jest.Mock };
    serviceVisit: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      company: { findUnique: jest.fn() },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      milestone: { findMany: jest.fn().mockResolvedValue([]) },
      serviceVisit: { findMany: jest.fn().mockResolvedValue([]) },
    };

    const module = await Test.createTestingModule({
      providers: [CalendarFeedService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(CalendarFeedService);
  });

  describe("buildFeed()", () => {
    it("throws when the token doesn't match any company", async () => {
      prisma.company.findUnique.mockResolvedValue(null);
      await expect(service.buildFeed("bad-token")).rejects.toThrow(NotFoundException);
    });

    it("emits a valid VCALENDAR wrapper with the company name, and no events when there are none", async () => {
      prisma.company.findUnique.mockResolvedValue({ id: "company-1", name: "Acme Co" });

      const ics = await service.buildFeed("good-token");

      expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/);
      expect(ics).toContain("X-WR-CALNAME:Acme Co — Cantero");
      expect(ics.trim()).toMatch(/END:VCALENDAR$/);
      expect(ics).not.toContain("BEGIN:VEVENT");
    });

    it("emits one VEVENT per task/milestone/service visit with folded lines", async () => {
      prisma.company.findUnique.mockResolvedValue({ id: "company-1", name: "Acme Co" });
      prisma.task.findMany.mockResolvedValue([
        { id: "task-1", dueDate: new Date("2026-02-01T00:00:00.000Z"), name: "Pour foundation", project: { name: "Main St" } },
      ]);
      prisma.milestone.findMany.mockResolvedValue([
        { id: "ms-1", dueDate: new Date("2026-03-01T00:00:00.000Z"), name: "Framing done", project: { name: "Main St" } },
      ]);
      prisma.serviceVisit.findMany.mockResolvedValue([
        { id: "sv-1", scheduledDate: new Date("2026-04-01T00:00:00.000Z"), serviceContract: { title: "HVAC check" } },
      ]);

      const ics = await service.buildFeed("good-token");

      expect(ics).toContain("UID:task-task-1@cantero");
      expect(ics).toContain("SUMMARY:Main St: Pour foundation");
      expect(ics).toContain("UID:milestone-ms-1@cantero");
      expect(ics).toContain("SUMMARY:Main St: Framing done (milestone)");
      expect(ics).toContain("UID:service-visit-sv-1@cantero");
      expect(ics).toContain("SUMMARY:Service visit: HVAC check");
      expect(ics).toContain("DTSTART:20260201T000000Z");
      expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(3);
    });

    it("folds a stray newline in a task name onto the same physical SUMMARY line instead of starting a new one", async () => {
      prisma.company.findUnique.mockResolvedValue({ id: "company-1", name: "Acme Co" });
      prisma.task.findMany.mockResolvedValue([
        { id: "task-1", dueDate: new Date("2026-02-01T00:00:00.000Z"), name: "Line1\nInjected:VEVENT", project: { name: "Main St" } },
      ]);

      const ics = await service.buildFeed("good-token");

      expect(ics).toContain("SUMMARY:Main St: Line1 Injected:VEVENT");
      expect((ics.match(/BEGIN:VEVENT/g) ?? []).length).toBe(1);
    });

    it("scopes every data source to the company owning the token", async () => {
      prisma.company.findUnique.mockResolvedValue({ id: "company-1", name: "Acme Co" });

      await service.buildFeed("good-token");

      expect(prisma.task.findMany.mock.calls[0][0].where.project.companyId).toBe("company-1");
      expect(prisma.milestone.findMany.mock.calls[0][0].where.project.companyId).toBe("company-1");
      expect(prisma.serviceVisit.findMany.mock.calls[0][0].where.companyId).toBe("company-1");
    });
  });

  describe("listEvents()", () => {
    it("returns an empty list when nothing is scheduled", async () => {
      const result = await service.listEvents("company-1");
      expect(result).toEqual([]);
    });

    it("merges tasks, milestones, and service visits sorted by date", async () => {
      prisma.task.findMany.mockResolvedValue([
        { id: "task-1", dueDate: new Date("2026-03-01"), name: "Pour foundation", project: { id: "proj-1", name: "Main St" } },
      ]);
      prisma.milestone.findMany.mockResolvedValue([
        { id: "ms-1", dueDate: new Date("2026-01-01"), name: "Kickoff", project: { id: "proj-1", name: "Main St" } },
      ]);
      prisma.serviceVisit.findMany.mockResolvedValue([
        { id: "sv-1", scheduledDate: new Date("2026-02-01"), serviceContract: { title: "HVAC check" } },
      ]);

      const result = await service.listEvents("company-1");

      expect(result.map((e) => e.id)).toEqual(["ms-1", "sv-1", "task-1"]);
      expect(result[0]).toEqual({ id: "ms-1", type: "milestone", date: new Date("2026-01-01"), title: "Kickoff", projectId: "proj-1", projectName: "Main St" });
      expect(result[1]).toEqual({ id: "sv-1", type: "service_visit", date: new Date("2026-02-01"), title: "HVAC check", projectId: null, projectName: null });
    });

    it("windows the query from one month back to monthsAhead months forward", async () => {
      await service.listEvents("company-1", 6);

      const taskWhere = prisma.task.findMany.mock.calls[0][0].where.dueDate;
      const expectedStart = new Date();
      expectedStart.setMonth(expectedStart.getMonth() - 1);
      const expectedEnd = new Date();
      expectedEnd.setMonth(expectedEnd.getMonth() + 6);

      const toleranceMs = 5000;
      expect(Math.abs(taskWhere.gte.getTime() - expectedStart.getTime())).toBeLessThan(toleranceMs);
      expect(Math.abs(taskWhere.lte.getTime() - expectedEnd.getTime())).toBeLessThan(toleranceMs);
    });
  });
});
