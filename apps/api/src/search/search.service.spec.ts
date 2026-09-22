import { Test } from "@nestjs/testing";
import { SearchService } from "./search.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { ProjectAccessService } from "../common/project-access/project-access.service";

const COMPANY_A = "company-a";

function emptyPrisma() {
  const findMany = () => jest.fn().mockResolvedValue([]);
  return {
    project: { findMany: findMany() },
    client: { findMany: findMany() },
    invoice: { findMany: findMany() },
    estimate: { findMany: findMany() },
    document: { findMany: findMany() },
    worker: { findMany: findMany() },
    supplier: { findMany: findMany() },
    rfi: { findMany: findMany() },
    punchListItem: { findMany: findMany() },
    submittal: { findMany: findMany() },
    incidentReport: { findMany: findMany() },
    warrantyClaim: { findMany: findMany() },
  };
}

describe("SearchService", () => {
  let service: SearchService;
  let prisma: ReturnType<typeof emptyPrisma>;
  let projectAccess: { filterAccessible: jest.Mock };

  beforeEach(async () => {
    prisma = emptyPrisma();
    projectAccess = { filterAccessible: jest.fn(async (projects: unknown[]) => projects) };

    const module = await Test.createTestingModule({
      providers: [SearchService, { provide: PrismaService, useValue: prisma }, { provide: ProjectAccessService, useValue: projectAccess }],
    }).compile();

    service = module.get(SearchService);
  });

  it("returns nothing for a query shorter than the minimum length", async () => {
    const results = await service.search(COMPANY_A, "a");

    expect(results).toEqual([]);
    expect(prisma.project.findMany).not.toHaveBeenCalled();
  });

  it("includes matches from every new source with the project as the link target", async () => {
    const project = { id: "project-1", name: "Site A" };
    prisma.rfi.findMany.mockResolvedValue([{ id: "rfi-1", number: "RFI-001", subject: "Door swing", project }]);
    prisma.punchListItem.findMany.mockResolvedValue([{ id: "punch-1", title: "Cracked tile", project }]);
    prisma.incidentReport.findMany.mockResolvedValue([{ id: "inc-1", description: "Loose scaffold plank", severity: "near_miss", location: null, project }]);
    prisma.warrantyClaim.findMany.mockResolvedValue([{ id: "claim-1", title: "Squeaky door", project }]);

    const results = await service.search(COMPANY_A, "door");
    const byId = Object.fromEntries(results.map((r) => [r.id, r]));

    expect(byId["rfi-1"]).toEqual({ type: "rfi", id: "rfi-1", title: "RFI-001: Door swing", subtitle: "Site A", link: "/projects/project-1" });
    expect(byId["punch-1"].type).toBe("punch_list_item");
    expect(byId["inc-1"].type).toBe("incident_report");
    expect(byId["claim-1"].type).toBe("warranty_claim");
  });

  it("dedupes a submittal revision chain down to the latest revision only", async () => {
    const project = { id: "project-1", name: "Site A" };
    prisma.submittal.findMany.mockResolvedValue([
      { id: "sub-rev1", rootSubmittalId: "sub-rev0", revision: 1, number: "SUB-001", title: "Tile drawing", project },
      { id: "sub-rev0", rootSubmittalId: null, revision: 0, number: "SUB-001", title: "Tile drawing", project },
    ]);

    const results = await service.search(COMPANY_A, "tile");
    const submittalResults = results.filter((r) => r.type === "submittal");

    expect(submittalResults).toHaveLength(1);
    expect(submittalResults[0].id).toBe("sub-rev1");
  });

  it("leaves out a restricted project the user isn't a member of, and everything inside it", async () => {
    const open = { id: "project-open", name: "Open site" };
    const secret = { id: "project-secret", name: "Secret site" };
    // The same findMany serves the project matches and the lookup of restricted projects.
    prisma.project.findMany.mockImplementation(async (args: { where: { restrictedToMembers?: boolean } }) =>
      args.where.restrictedToMembers ? [{ id: secret.id, restrictedToMembers: true }] : [{ ...secret, address: null }, { ...open, address: null }],
    );
    prisma.rfi.findMany.mockResolvedValue([
      { id: "rfi-open", number: "RFI-1", subject: "Door", project: open },
      { id: "rfi-secret", number: "RFI-2", subject: "Door", project: secret },
    ]);
    projectAccess.filterAccessible.mockResolvedValue([]); // not a member of the restricted one

    const results = await service.search(COMPANY_A, "door", "user-1", "worker");

    expect(results.map((r) => r.id).sort()).toEqual(["project-open", "rfi-open"]);
    expect(projectAccess.filterAccessible).toHaveBeenCalledWith([{ id: secret.id, restrictedToMembers: true }], "user-1", "worker");
    expect(results[0]).not.toHaveProperty("projectId");
  });
});
