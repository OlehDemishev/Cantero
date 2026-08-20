import { Test } from "@nestjs/testing";
import { NotificationsService } from "./notifications.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";
const USER_A = "user-a";

describe("NotificationsService.list", () => {
  let service: NotificationsService;
  let prisma: {
    materialCatalogItem: { findMany: jest.Mock };
    clientReminder: { findMany: jest.Mock };
    invoice: { findMany: jest.Mock };
    rfi: { findMany: jest.Mock };
    punchListItem: { findMany: jest.Mock };
    submittal: { findMany: jest.Mock };
    incidentReport: { findMany: jest.Mock };
    membership: { findFirst: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      materialCatalogItem: { findMany: jest.fn().mockResolvedValue([]) },
      clientReminder: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      rfi: { findMany: jest.fn().mockResolvedValue([]) },
      punchListItem: { findMany: jest.fn().mockResolvedValue([]) },
      submittal: { findMany: jest.fn().mockResolvedValue([]) },
      incidentReport: { findMany: jest.fn().mockResolvedValue([]) },
      membership: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    const module = await Test.createTestingModule({
      providers: [NotificationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(NotificationsService);
  });

  it("marks an open RFI critical only once its due date has passed", async () => {
    const project = { id: "project-1", name: "Site A" };
    prisma.rfi.findMany.mockResolvedValue([
      { id: "rfi-overdue", number: "RFI-001", subject: "Door swing", dueDate: new Date(Date.now() - 86_400_000), createdAt: new Date(), project },
      { id: "rfi-future", number: "RFI-002", subject: "Window flashing", dueDate: new Date(Date.now() + 86_400_000), createdAt: new Date(), project },
    ]);

    const { notifications } = await service.list(COMPANY_A, USER_A);
    const byKey = Object.fromEntries(notifications.map((n) => [n.key, n]));

    expect(byKey["rfi:rfi-overdue"].severity).toBe("critical");
    expect(byKey["rfi:rfi-future"].severity).toBe("warning");
  });

  it("flags a revise-and-resubmit submittal as critical and a submitted one as a warning", async () => {
    const project = { id: "project-1", name: "Site A" };
    prisma.submittal.findMany.mockResolvedValue([
      { id: "sub-1", number: "SUB-001", revision: 0, title: "Tile shop drawing", status: "submitted", createdAt: new Date(), project },
      { id: "sub-2", number: "SUB-002", revision: 1, title: "Window schedule", status: "revise_and_resubmit", createdAt: new Date(), project },
    ]);

    const { notifications } = await service.list(COMPANY_A, USER_A);
    const byKey = Object.fromEntries(notifications.map((n) => [n.key, n]));

    expect(byKey["submittal:sub-1"].severity).toBe("warning");
    expect(byKey["submittal:sub-2"].severity).toBe("critical");
  });

  it("ignores a superseded submittal revision once a later revision in the same chain is resolved", async () => {
    const project = { id: "project-1", name: "Site A" };
    prisma.submittal.findMany.mockResolvedValue([
      // rev 0 was sent back for revision, but rev 1 (the latest in the chain) was approved —
      // rev 0's stale "revise_and_resubmit" status must not still generate a notification.
      { id: "sub-1-rev0", rootSubmittalId: null, revision: 0, status: "revise_and_resubmit", number: "SUB-001", title: "Tile drawing", createdAt: new Date(), project },
      { id: "sub-1-rev1", rootSubmittalId: "sub-1-rev0", revision: 1, status: "approved", number: "SUB-001", title: "Tile drawing", createdAt: new Date(), project },
    ]);

    const { notifications } = await service.list(COMPANY_A, USER_A);

    expect(notifications.some((n) => n.key.startsWith("submittal:"))).toBe(false);
  });

  it("flags a lost-time-injury incident as critical and a near-miss as a warning", async () => {
    const project = { id: "project-1", name: "Site A" };
    prisma.incidentReport.findMany.mockResolvedValue([
      { id: "inc-1", severity: "near_miss", location: null, createdAt: new Date(), project },
      { id: "inc-2", severity: "lost_time_injury", location: null, createdAt: new Date(), project },
    ]);

    const { notifications } = await service.list(COMPANY_A, USER_A);
    const byKey = Object.fromEntries(notifications.map((n) => [n.key, n]));

    expect(byKey["incident:inc-1"].severity).toBe("warning");
    expect(byKey["incident:inc-2"].severity).toBe("critical");
  });

  it("includes results from every source, sorted newest first", async () => {
    const project = { id: "project-1", name: "Site A" };
    prisma.punchListItem.findMany.mockResolvedValue([
      { id: "punch-1", title: "Cracked tile", location: null, dueDate: null, createdAt: new Date("2026-01-01"), project },
    ]);
    prisma.rfi.findMany.mockResolvedValue([
      { id: "rfi-1", number: "RFI-001", subject: "Door swing", dueDate: null, createdAt: new Date("2026-06-01"), project },
    ]);

    const { notifications } = await service.list(COMPANY_A, USER_A);

    expect(notifications.map((n) => n.key)).toEqual(["rfi:rfi-1", "punch_list:punch-1"]);
  });
});
