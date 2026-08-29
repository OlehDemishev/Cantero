import { Test } from "@nestjs/testing";
import { PublicApiService } from "./public-api.service";
import { ProjectsService } from "../projects/projects.service";
import { ClientsService } from "../crm/clients.service";
import { InvoicesService } from "../finance/invoices.service";
import { EstimatesService } from "../estimates/estimates.service";
import { WorkersService } from "../team/workers.service";
import { MaterialCatalogService } from "../materials/material-catalog.service";
import { TimeEntriesService } from "../team/time-entries.service";
import { BudgetService } from "../finance/budget.service";

const COMPANY_A = "company-a";

describe("PublicApiService", () => {
  let service: PublicApiService;
  let projectsService: { list: jest.Mock };
  let materialCatalogService: { list: jest.Mock; importCsv: jest.Mock };
  let clientsService: { list: jest.Mock; importCsv: jest.Mock };
  let invoicesService: { list: jest.Mock; exportCsv: jest.Mock };
  let workersService: { list: jest.Mock };
  let estimatesService: { list: jest.Mock };
  let timeEntriesService: { list: jest.Mock };
  let budgetService: { getForProject: jest.Mock };

  beforeEach(async () => {
    projectsService = { list: jest.fn() };
    clientsService = { list: jest.fn(), importCsv: jest.fn() };
    invoicesService = { list: jest.fn(), exportCsv: jest.fn() };
    estimatesService = { list: jest.fn().mockResolvedValue([]) };
    workersService = { list: jest.fn().mockResolvedValue([]) };
    materialCatalogService = { list: jest.fn(), importCsv: jest.fn() };
    timeEntriesService = { list: jest.fn().mockResolvedValue([]) };
    budgetService = { getForProject: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        PublicApiService,
        { provide: ProjectsService, useValue: projectsService },
        { provide: ClientsService, useValue: clientsService },
        { provide: InvoicesService, useValue: invoicesService },
        { provide: EstimatesService, useValue: estimatesService },
        { provide: WorkersService, useValue: workersService },
        { provide: MaterialCatalogService, useValue: materialCatalogService },
        { provide: TimeEntriesService, useValue: timeEntriesService },
        { provide: BudgetService, useValue: budgetService },
      ],
    }).compile();

    service = module.get(PublicApiService);
  });

  describe("pagination", () => {
    it("returns every row when no page params are given", async () => {
      projectsService.list.mockResolvedValue([{ id: "1" }, { id: "2" }, { id: "3" }]);

      const result = await service.projects(COMPANY_A, "json");

      expect(result).toHaveLength(3);
    });

    it("slices rows by limit/offset when page params are given", async () => {
      projectsService.list.mockResolvedValue([{ id: "1" }, { id: "2" }, { id: "3" }]);

      const result = await service.projects(COMPANY_A, "json", { limit: 1, offset: 1 });

      expect(result).toEqual([{ id: "2" }]);
    });

    it("paginates the project list before running the per-project budget lookup", async () => {
      projectsService.list.mockResolvedValue([{ id: "1", name: "A" }, { id: "2", name: "B" }, { id: "3", name: "C" }]);
      budgetService.getForProject.mockResolvedValue({
        grandTotalBudget: 0,
        materialsCostActual: 0,
        laborCostActual: 0,
        invoicedTotal: 0,
      });

      await service.budget(COMPANY_A, "json", { limit: 1, offset: 0 });

      expect(budgetService.getForProject).toHaveBeenCalledTimes(1);
    });
  });

  describe("invoices()", () => {
    it("delegates csv format to InvoicesService's own accounting export, not a generic rebuild", async () => {
      invoicesService.exportCsv.mockResolvedValue("Number,Status\nINV-1,sent\n");

      const result = await service.invoices(COMPANY_A, "csv");

      expect(invoicesService.exportCsv).toHaveBeenCalledWith(COMPANY_A);
      expect(result).toBe("Number,Status\nINV-1,sent\n");
      expect(invoicesService.list).not.toHaveBeenCalled();
    });
  });

  describe("exportAll()", () => {
    it("includes every resource for an unrestricted (empty-scopes) key", async () => {
      projectsService.list.mockResolvedValue([]);
      clientsService.list.mockResolvedValue([]);
      invoicesService.exportCsv.mockResolvedValue("");
      materialCatalogService.list.mockResolvedValue([]);

      const buffer = await service.exportAll(COMPANY_A, []);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("only builds files for resources the key is actually scoped for", async () => {
      materialCatalogService.list.mockResolvedValue([{ id: "m-1", code: "TILE", name: "Tile", unit: "m2", defaultUnitPrice: 10 }]);

      await service.exportAll(COMPANY_A, ["materials"]);

      expect(materialCatalogService.list).toHaveBeenCalled();
      expect(projectsService.list).not.toHaveBeenCalled();
      expect(clientsService.list).not.toHaveBeenCalled();
    });
  });

  describe("bulk import", () => {
    it("delegates material import to MaterialCatalogService.importCsv with a synthetic API-key actor", async () => {
      materialCatalogService.importCsv.mockResolvedValue({ created: 2, skipped: 0, errors: [] });

      const result = await service.importMaterials(COMPANY_A, "code,name,unit,defaultUnitPrice\nA,Item A,ea,1\n");

      expect(materialCatalogService.importCsv).toHaveBeenCalledWith(
        COMPANY_A,
        expect.objectContaining({ userId: "api-key" }),
        expect.stringContaining("code,name"),
      );
      expect(result).toEqual({ created: 2, skipped: 0, errors: [] });
    });

    it("delegates client import to ClientsService.importCsv with a synthetic API-key actor", async () => {
      clientsService.importCsv.mockResolvedValue({ created: 1, skipped: 0, errors: [] });

      await service.importClients(COMPANY_A, "name,email\nAcme,a@x.com\n");

      expect(clientsService.importCsv).toHaveBeenCalledWith(COMPANY_A, expect.objectContaining({ userId: "api-key" }), expect.any(String));
    });
  });
});
