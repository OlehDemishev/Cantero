import { Test } from "@nestjs/testing";
import { NotificationsService } from "./notifications.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { WeatherService } from "../weather/weather.service";
import { BudgetService } from "../finance/budget.service";

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
    warrantyClaim: { findMany: jest.Mock };
    commentMention: { findMany: jest.Mock };
    subcontractorDocument: { findMany: jest.Mock };
    workerCertification: { findMany: jest.Mock };
    task: { findMany: jest.Mock };
    project: { findMany: jest.Mock };
    membership: { findFirst: jest.Mock };
    notificationRead: { findMany: jest.Mock };
  };
  let weather: { geocode: jest.Mock; forecast: jest.Mock };
  let budget: { getForProject: jest.Mock };

  beforeEach(async () => {
    prisma = {
      materialCatalogItem: { findMany: jest.fn().mockResolvedValue([]) },
      clientReminder: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      rfi: { findMany: jest.fn().mockResolvedValue([]) },
      punchListItem: { findMany: jest.fn().mockResolvedValue([]) },
      submittal: { findMany: jest.fn().mockResolvedValue([]) },
      incidentReport: { findMany: jest.fn().mockResolvedValue([]) },
      warrantyClaim: { findMany: jest.fn().mockResolvedValue([]) },
      commentMention: { findMany: jest.fn().mockResolvedValue([]) },
      subcontractorDocument: { findMany: jest.fn().mockResolvedValue([]) },
      workerCertification: { findMany: jest.fn().mockResolvedValue([]) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      project: { findMany: jest.fn().mockResolvedValue([]) },
      membership: { findFirst: jest.fn().mockResolvedValue(null) },
      notificationRead: { findMany: jest.fn().mockResolvedValue([]) },
    };
    weather = { geocode: jest.fn(), forecast: jest.fn() };
    budget = { getForProject: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WeatherService, useValue: weather },
        { provide: BudgetService, useValue: budget },
      ],
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

  it("flags a client-submitted warranty claim as critical and an internally-logged one as a warning", async () => {
    const project = { id: "project-1", name: "Site A" };
    prisma.warrantyClaim.findMany.mockResolvedValue([
      { id: "claim-1", title: "Cracked grout", location: null, submittedByClientId: "client-1", createdAt: new Date(), project },
      { id: "claim-2", title: "Squeaky door", location: null, submittedByClientId: null, createdAt: new Date(), project },
    ]);

    const { notifications } = await service.list(COMPANY_A, USER_A);
    const byKey = Object.fromEntries(notifications.map((n) => [n.key, n]));

    expect(byKey["warranty_claim:claim-1"].severity).toBe("critical");
    expect(byKey["warranty_claim:claim-2"].severity).toBe("warning");
  });

  it("surfaces a mention on an RFI comment, labelled with the commenter and the RFI's project", async () => {
    const project = { id: "project-1", name: "Site A" };
    prisma.commentMention.findMany.mockResolvedValue([
      {
        id: "mention-1",
        createdAt: new Date("2026-06-01"),
        comment: {
          authorName: "Anke Müller",
          content: "Can you take a look at this?",
          task: null,
          rfi: { subject: "Door swing", project },
          punchListItem: null,
        },
      },
    ]);

    const { notifications } = await service.list(COMPANY_A, USER_A);
    const mention = notifications.find((n) => n.key === "mention:mention-1");

    expect(mention).toBeDefined();
    expect(mention?.title).toBe("Anke Müller mentioned you");
    expect(mention?.body).toContain("Door swing");
    expect(mention?.body).toContain("Site A");
    expect(mention?.link).toBe("/projects/project-1");
  });

  it("flags an already-expired subcontractor document as critical and one expiring soon as a warning", async () => {
    prisma.subcontractorDocument.findMany.mockResolvedValue([
      { id: "doc-1", name: "GL Policy", expiresAt: new Date(Date.now() - 86_400_000), subcontractor: { name: "Acme Electric" } },
      { id: "doc-2", name: "WC Policy", expiresAt: new Date(Date.now() + 5 * 86_400_000), subcontractor: { name: "Acme Electric" } },
    ]);

    const { notifications } = await service.list(COMPANY_A, USER_A);
    const byKey = Object.fromEntries(notifications.map((n) => [n.key, n]));

    expect(byKey["subcontractor_document:doc-1"].severity).toBe("critical");
    expect(byKey["subcontractor_document:doc-2"].severity).toBe("warning");
  });

  it("flags an already-expired worker certification as critical and one expiring soon as a warning", async () => {
    prisma.workerCertification.findMany.mockResolvedValue([
      { id: "cert-1", name: "OSHA 30", expiresAt: new Date(Date.now() - 86_400_000), worker: { id: "worker-1", name: "Peter Bauer" } },
      { id: "cert-2", name: "Forklift", expiresAt: new Date(Date.now() + 5 * 86_400_000), worker: { id: "worker-1", name: "Peter Bauer" } },
    ]);

    const { notifications } = await service.list(COMPANY_A, USER_A);
    const byKey = Object.fromEntries(notifications.map((n) => [n.key, n]));

    expect(byKey["worker_certification:cert-1"].severity).toBe("critical");
    expect(byKey["worker_certification:cert-2"].severity).toBe("warning");
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

  it("flags an outdoor task whose start date lands on a risky forecast day", async () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 2);
    const dateStr = startDate.toISOString().slice(0, 10);

    prisma.task.findMany.mockResolvedValue([
      {
        id: "task-1",
        projectId: "project-1",
        name: "Pour foundation",
        startDate,
        project: { id: "project-1", name: "Site A", address: "1 River Rd, Berlin" },
      },
    ]);
    weather.geocode.mockResolvedValue({ lat: 52.5, lon: 13.4 });
    weather.forecast.mockResolvedValue([{ date: dateStr, condition: "rain", tempMaxC: 10, tempMinC: 5, risky: true }]);

    const { notifications } = await service.list(COMPANY_A, USER_A);
    const risk = notifications.find((n) => n.key === "weather_risk:task-1");

    expect(risk).toBeDefined();
    expect(risk?.severity).toBe("warning");
    expect(risk?.link).toBe("/projects/project-1");
  });

  it("escalates severity to critical for extreme conditions", async () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    const dateStr = startDate.toISOString().slice(0, 10);

    prisma.task.findMany.mockResolvedValue([
      {
        id: "task-2",
        projectId: "project-1",
        name: "Roof shingling",
        startDate,
        project: { id: "project-1", name: "Site A", address: "1 River Rd, Berlin" },
      },
    ]);
    weather.geocode.mockResolvedValue({ lat: 52.5, lon: 13.4 });
    weather.forecast.mockResolvedValue([{ date: dateStr, condition: "extreme_heat", tempMaxC: 40, tempMinC: 28, risky: true }]);

    const { notifications } = await service.list(COMPANY_A, USER_A);
    const risk = notifications.find((n) => n.key === "weather_risk:task-2");

    expect(risk?.severity).toBe("critical");
  });

  it("does not flag an outdoor task when its forecast day isn't risky", async () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);
    const dateStr = startDate.toISOString().slice(0, 10);

    prisma.task.findMany.mockResolvedValue([
      {
        id: "task-3",
        projectId: "project-1",
        name: "Framing",
        startDate,
        project: { id: "project-1", name: "Site A", address: "1 River Rd, Berlin" },
      },
    ]);
    weather.geocode.mockResolvedValue({ lat: 52.5, lon: 13.4 });
    weather.forecast.mockResolvedValue([{ date: dateStr, condition: "clear", tempMaxC: 20, tempMinC: 10, risky: false }]);

    const { notifications } = await service.list(COMPANY_A, USER_A);

    expect(notifications.some((n) => n.key === "weather_risk:task-3")).toBe(false);
  });

  it("skips a project with no address rather than failing the whole pass", async () => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 1);

    prisma.task.findMany.mockResolvedValue([
      { id: "task-4", projectId: "project-1", name: "Excavation", startDate, project: { id: "project-1", name: "Site A", address: null } },
    ]);

    const { notifications } = await service.list(COMPANY_A, USER_A);

    expect(notifications.some((n) => n.key === "weather_risk:task-4")).toBe(false);
    expect(weather.geocode).not.toHaveBeenCalled();
  });

  it("flags a project at or above the budget-overrun threshold, critical once it's over 100%", async () => {
    prisma.project.findMany.mockResolvedValue([{ id: "project-over", name: "Over Budget Site" }]);
    budget.getForProject.mockResolvedValue({
      grandTotalBudget: 1000,
      materialsCostActual: 700,
      laborCostActual: 400,
      subcontractorCostActual: 0,
    });

    const { notifications } = await service.list(COMPANY_A, USER_A);

    const item = notifications.find((n) => n.key === "budget_overrun:project-over");
    expect(item?.severity).toBe("critical");
  });

  it("does not flag a project with no approved-estimate budget to compare against", async () => {
    prisma.project.findMany.mockResolvedValue([{ id: "project-unestimated", name: "No Estimate Site" }]);
    budget.getForProject.mockResolvedValue({
      grandTotalBudget: 0,
      materialsCostActual: 500,
      laborCostActual: 0,
      subcontractorCostActual: 0,
    });

    const { notifications } = await service.list(COMPANY_A, USER_A);

    expect(notifications.some((n) => n.key === "budget_overrun:project-unestimated")).toBe(false);
  });
});

describe("NotificationsService — read tracking", () => {
  let service: NotificationsService;
  let prisma: {
    materialCatalogItem: { findMany: jest.Mock };
    clientReminder: { findMany: jest.Mock };
    invoice: { findMany: jest.Mock };
    rfi: { findMany: jest.Mock };
    punchListItem: { findMany: jest.Mock };
    submittal: { findMany: jest.Mock };
    incidentReport: { findMany: jest.Mock };
    warrantyClaim: { findMany: jest.Mock };
    commentMention: { findMany: jest.Mock };
    subcontractorDocument: { findMany: jest.Mock };
    workerCertification: { findMany: jest.Mock };
    task: { findMany: jest.Mock };
    project: { findMany: jest.Mock };
    membership: { findFirst: jest.Mock };
    notificationRead: { findMany: jest.Mock; upsert: jest.Mock; createMany: jest.Mock };
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
      warrantyClaim: { findMany: jest.fn().mockResolvedValue([]) },
      commentMention: { findMany: jest.fn().mockResolvedValue([]) },
      subcontractorDocument: { findMany: jest.fn().mockResolvedValue([]) },
      workerCertification: { findMany: jest.fn().mockResolvedValue([]) },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      project: { findMany: jest.fn().mockResolvedValue([]) },
      membership: { findFirst: jest.fn().mockResolvedValue(null) },
      notificationRead: { findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn(), createMany: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WeatherService, useValue: { geocode: jest.fn(), forecast: jest.fn() } },
        { provide: BudgetService, useValue: { getForProject: jest.fn() } },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  it("marks a notification item read via upsert, so re-marking the same key never errors", async () => {
    await service.markRead(COMPANY_A, USER_A, "low_stock:item-1");

    expect(prisma.notificationRead.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_notificationKey: { userId: USER_A, notificationKey: "low_stock:item-1" } },
      }),
    );
  });

  it("marks a batch of keys read in one call, skipping ones already marked", async () => {
    await service.markAllRead(COMPANY_A, USER_A, ["a", "b", "c"]);

    expect(prisma.notificationRead.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { companyId: COMPANY_A, userId: USER_A, notificationKey: "a" },
          { companyId: COMPANY_A, userId: USER_A, notificationKey: "b" },
          { companyId: COMPANY_A, userId: USER_A, notificationKey: "c" },
        ],
        skipDuplicates: true,
      }),
    );
  });

  it("flags a notification item as read in list() once a NotificationRead row exists for it", async () => {
    prisma.clientReminder.findMany.mockResolvedValue([
      {
        id: "r-1",
        clientId: "c-1",
        title: "Call back",
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        client: { id: "c-1", name: "Acme" },
      },
    ]);
    prisma.notificationRead.findMany.mockResolvedValue([{ notificationKey: "reminder:r-1" }]);

    const { notifications } = await service.list(COMPANY_A, USER_A);

    const item = notifications.find((n) => n.key === "reminder:r-1");
    expect(item?.read).toBe(true);
  });
});
