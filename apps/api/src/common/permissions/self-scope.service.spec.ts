import { ForbiddenException } from "@nestjs/common";
import type { AuthUser } from "@cantero/shared";
import { DEFAULT_GRANTS, seesCrew } from "@cantero/shared";
import { CREW, SelfScopeService } from "./self-scope.service";
import { redactWorkerFields } from "./worker-fields.interceptor";

const worker = { userId: "u-w", companyId: "co", role: "worker", permissions: ["projects.all"] } as AuthUser;
const foreman = { userId: "u-f", companyId: "co", role: "foreman", permissions: ["projects.all", "site.crewTime", "site.manage"] } as AuthUser;
const accountant = { userId: "u-a", companyId: "co", role: "accountant", permissions: ["projects.all", "hr.payroll", "finance.view"] } as AuthUser;

describe("SelfScopeService", () => {
  let prisma: any;
  let scope: SelfScopeService;

  beforeEach(() => {
    prisma = {
      worker: { findMany: jest.fn().mockResolvedValue([{ id: "w-own" }]) },
      timeEntry: { findFirst: jest.fn() },
    };
    scope = new SelfScopeService(prisma);
  });

  it("shows a worker only their own records, and the crew to the site lead and payroll", async () => {
    expect(await scope.listScope(worker, undefined, CREW.time)).toEqual(["w-own"]);
    expect(prisma.worker.findMany).toHaveBeenCalledWith({ where: { companyId: "co", userId: "u-w" }, select: { id: true } });
    expect(await scope.listScope(foreman, undefined, CREW.time)).toBeUndefined();
    expect(await scope.listScope(accountant, undefined, CREW.time)).toBeUndefined();
  });

  it("gives a worker nothing when they ask for someone else's records", async () => {
    expect(await scope.listScope(worker, "w-other", CREW.time)).toEqual([]);
    expect(await scope.listScope(worker, "w-own", CREW.time)).toEqual(["w-own"]);
  });

  it("refuses acting for another worker, or on another worker's record", async () => {
    await expect(scope.assertOwnWorker(worker, "w-other", CREW.time)).rejects.toThrow(ForbiddenException);
    await expect(scope.assertOwnWorker(worker, "w-own", CREW.time)).resolves.toBeUndefined();
    await expect(scope.assertOwnWorker(foreman, "w-other", CREW.time)).resolves.toBeUndefined();
    prisma.timeEntry.findFirst.mockResolvedValue({ workerId: "w-other" });
    await expect(scope.assertOwnRecord(worker, "timeEntry", "te-1", CREW.time)).rejects.toThrow(ForbiddenException);
    prisma.timeEntry.findFirst.mockResolvedValue({ workerId: "w-own" });
    await expect(scope.assertOwnRecord(worker, "timeEntry", "te-1", CREW.time)).resolves.toBeUndefined();
  });

  it("trusts an internal caller with no permissions attached", async () => {
    expect(await scope.listScope({ companyId: "co" } as AuthUser, undefined, CREW.time)).toBeUndefined();
  });
});

describe("redactWorkerFields", () => {
  const body = () => ({
    entries: [
      {
        id: "te-1",
        hours: 8,
        hourlyCostSnapshot: "42.00",
        worker: { id: "w1", name: "Anna", hourlyCost: "42.00", phone: "+49 1", payrollEmployeeId: "E-7", ptoBalanceHours: "12", isApprentice: false },
        project: { id: "p1", name: "Tower", client: { id: "c1", name: "Nordwind", phone: "+49 client" } },
      },
    ],
  });

  it("takes out pay rates without people.rates, and a worker's personal details without people.contacts", () => {
    const out = redactWorkerFields(body(), { hideRates: true, hideContacts: true });
    expect(out.entries[0]).not.toHaveProperty("hourlyCostSnapshot");
    expect(out.entries[0].worker).toEqual({ id: "w1", name: "Anna", isApprentice: false });
    // A client's phone isn't a worker's: it stays.
    expect(out.entries[0].project.client.phone).toBe("+49 client");
  });

  it("leaves what the member may see", () => {
    const out = redactWorkerFields(body(), { hideRates: false, hideContacts: true });
    expect(out.entries[0].worker.hourlyCost).toBe("42.00");
    expect(out.entries[0].worker).not.toHaveProperty("phone");
  });
});

describe("seesCrew — what the apps offer to pick, from the same table the API enforces", () => {
  it("fixes a worker to themselves and lets the site lead, payroll and finance pick the crew", () => {
    expect(seesCrew(DEFAULT_GRANTS.worker, "time")).toBe(false);
    expect(seesCrew(DEFAULT_GRANTS.worker, "expenses")).toBe(false);
    expect(seesCrew(DEFAULT_GRANTS.foreman, "time")).toBe(true);
    expect(seesCrew(DEFAULT_GRANTS.accountant, "expenses")).toBe(true);
    expect(seesCrew(DEFAULT_GRANTS.estimator, "time")).toBe(false);
    expect(seesCrew(undefined, "time")).toBe(false);
    // A worker granted the site lead's crew permission picks colleagues too.
    expect(seesCrew([...DEFAULT_GRANTS.worker, "site.crewTime"], "time")).toBe(true);
  });
});

