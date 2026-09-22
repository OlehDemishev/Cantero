import { excludeProjectsWhere, projectPathFor, projectSelect, readProjectId } from "./project-path";

describe("project paths from the Prisma schema", () => {
  it("uses a model's own projectId, or follows its parents", () => {
    expect(projectPathFor("DailyLog")).toEqual([]);
    expect(projectPathFor("EstimateLine")).toEqual(["estimate"]);
    expect(projectPathFor("CylinderBreak")).toEqual(["pour"]);
    expect(projectPathFor("Worker")).toBeNull();
    expect(projectPathFor("Project")).toBeNull();
  });

  it("reads the projectId at the end of the path", () => {
    expect(projectSelect(["estimate"])).toEqual({ estimate: { select: { projectId: true } } });
    expect(readProjectId({ estimate: { projectId: "p1" } }, ["estimate"])).toBe("p1");
    expect(readProjectId({ estimate: null }, ["estimate"])).toBeNull();
    expect(readProjectId(null, [])).toBeNull();
  });

  it("excludes hidden projects while keeping rows with no project", () => {
    expect(excludeProjectsWhere("Project", ["p9"])).toEqual({ id: { notIn: ["p9"] } });
    // Required projectId: a plain NOT IN.
    expect(excludeProjectsWhere("DailyLog", ["p9"])).toEqual({ projectId: { notIn: ["p9"] } });
    // Optional projectId: NULL has to be let through explicitly.
    expect(excludeProjectsWhere("Estimate", ["p9"])).toEqual({ OR: [{ projectId: null }, { projectId: { notIn: ["p9"] } }] });
    // Through a required parent whose projectId is optional.
    expect(excludeProjectsWhere("ChangeOrder", ["p9"])).toEqual({
      estimate: { is: { OR: [{ projectId: null }, { projectId: { notIn: ["p9"] } }] } },
    });
  });
});
