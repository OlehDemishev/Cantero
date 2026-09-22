import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { REPORT_ROLES } from "@cantero/shared";
import { ROLES_KEY } from "../common/decorators/roles.decorator";
import { ReportsController } from "./reports.controller";

/** Every report route names who may open it (REPORT_ROLES, shared with the web app): a new report
 * added without @ReportRoles would otherwise be open to every member, a worker included. */
describe("ReportsController access", () => {
  const handlers = Object.getOwnPropertyNames(ReportsController.prototype)
    .map((name) => ({ name, fn: ReportsController.prototype[name as keyof ReportsController] as unknown as object }))
    .filter(({ name, fn }) => name !== "constructor" && Reflect.getMetadata(METHOD_METADATA, fn) !== undefined);

  it("restricts every report route to named roles", () => {
    expect(handlers.length).toBeGreaterThanOrEqual(18);
    const open = handlers.filter(({ fn }) => !(Reflect.getMetadata(ROLES_KEY, fn) as string[] | undefined)?.length).map((h) => h.name);
    expect(open).toEqual([]);
  });

  it("uses the shared table for each route, and never lets a worker in", () => {
    for (const { name, fn } of handlers) {
      const key = (Reflect.getMetadata(PATH_METADATA, fn) as string).split("/")[0] as keyof typeof REPORT_ROLES;
      expect([name, Reflect.getMetadata(ROLES_KEY, fn)]).toEqual([name, [...REPORT_ROLES[key]]]);
    }
    expect(Object.values(REPORT_ROLES).flat()).not.toContain("worker");
  });
});
