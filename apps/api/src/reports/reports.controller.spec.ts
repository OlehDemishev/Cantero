import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { REPORT_PERMISSIONS, DEFAULT_GRANTS } from "@cantero/shared";
import { REQUIRES_KEY } from "../common/decorators/permissions.decorator";
import { ReportsController } from "./reports.controller";

/** Every report route names the capability it needs (REPORT_PERMISSIONS, shared with the web app): a
 * new report added without @ReportRoles would otherwise be open to every member, a worker included. */
describe("ReportsController access", () => {
  const handlers = Object.getOwnPropertyNames(ReportsController.prototype)
    .map((name) => ({ name, fn: ReportsController.prototype[name as keyof ReportsController] as unknown as object }))
    .filter(({ name, fn }) => name !== "constructor" && Reflect.getMetadata(METHOD_METADATA, fn) !== undefined);

  it("restricts every report route to a capability", () => {
    expect(handlers.length).toBeGreaterThanOrEqual(18);
    const open = handlers.filter(({ fn }) => !Reflect.getMetadata(REQUIRES_KEY, fn)).map((h) => h.name);
    expect(open).toEqual([]);
  });

  it("uses the shared table for each route, and by default no report is a worker's", () => {
    for (const { name, fn } of handlers) {
      const key = (Reflect.getMetadata(PATH_METADATA, fn) as string).split("/")[0] as keyof typeof REPORT_PERMISSIONS;
      expect([name, Reflect.getMetadata(REQUIRES_KEY, fn)]).toEqual([name, REPORT_PERMISSIONS[key]]);
    }
    for (const permission of Object.values(REPORT_PERMISSIONS)) expect(DEFAULT_GRANTS.worker).not.toContain(permission);
  });
});
