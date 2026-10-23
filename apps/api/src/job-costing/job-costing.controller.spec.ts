import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { JobCostingController } from "./job-costing.controller";
import { JobCostingService } from "./job-costing.service";
import { globalValidationPipe } from "../common/pipes/global-validation.pipe";

const PROJECT = "11111111-1111-4111-8111-111111111111";

/** Boots the controller over real HTTP with main.ts's global pipe, since the bug was the global
 * pipe and the parameter pipe disagreeing about a query parameter that was simply left out. */
describe("JobCostingController (HTTP)", () => {
  let app: INestApplication;
  let base: string;
  const service = { history: jest.fn().mockResolvedValue([]) };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [JobCostingController],
      providers: [{ provide: JobCostingService, useValue: service }],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.use((req: { user?: unknown }, _res: unknown, next: () => void) => {
      req.user = { userId: "u-1", companyId: "c-1", permissions: ["costing.view"] };
      next();
    });
    app.useGlobalPipes(globalValidationPipe());
    await app.listen(0);
    base = (await app.getUrl()).replace("[::1]", "localhost");
  });

  afterAll(() => app.close());
  beforeEach(() => service.history.mockClear());

  it("GET /job-costing/history without months: 200, and the service applies its own default", async () => {
    const res = await fetch(`${base}/job-costing/history?projectId=${PROJECT}`);

    expect(res.status).toBe(200);
    expect(service.history).toHaveBeenCalledWith("c-1", PROJECT, undefined);
  });

  it("passes an explicit months through as a number", async () => {
    const res = await fetch(`${base}/job-costing/history?projectId=${PROJECT}&months=6`);

    expect(res.status).toBe(200);
    expect(service.history).toHaveBeenCalledWith("c-1", PROJECT, 6);
  });

  it("still answers a malformed months with a 400", async () => {
    const res = await fetch(`${base}/job-costing/history?projectId=${PROJECT}&months=abc`);

    expect(res.status).toBe(400);
    expect(service.history).not.toHaveBeenCalled();
  });
});
