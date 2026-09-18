import { DocusignPollingService } from "./docusign-polling.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { ContractsService } from "./contracts.service";

describe("DocusignPollingService", () => {
  let service: DocusignPollingService;
  let prisma: { contract: { findMany: jest.Mock } };
  let contracts: { refreshDocusignStatus: jest.Mock };
  let queue: { add: jest.Mock };

  beforeEach(() => {
    prisma = { contract: { findMany: jest.fn() } };
    contracts = { refreshDocusignStatus: jest.fn() };
    queue = { add: jest.fn() };
    service = new DocusignPollingService(prisma as unknown as PrismaService, contracts as unknown as ContractsService, queue as never);
  });

  describe("onModuleInit()", () => {
    it("schedules a repeating job with a stable jobId, so re-registering on restart doesn't duplicate it", async () => {
      await service.onModuleInit();

      expect(queue.add).toHaveBeenCalledWith(
        "run-due",
        {},
        expect.objectContaining({ repeat: expect.objectContaining({ every: expect.any(Number) }), jobId: "docusign-poll-repeat" }),
      );
    });
  });

  describe("runDuePass()", () => {
    it("only looks at contracts still awaiting a DocuSign signature", async () => {
      prisma.contract.findMany.mockResolvedValue([]);

      await service.runDuePass();

      expect(prisma.contract.findMany).toHaveBeenCalledWith({
        where: { status: "sent", docusignEnvelopeId: { not: null } },
        select: { id: true, companyId: true },
      });
    });

    it("checks every pending contract sequentially and tallies signed/voided outcomes", async () => {
      prisma.contract.findMany.mockResolvedValue([
        { id: "c1", companyId: "company-a" },
        { id: "c2", companyId: "company-a" },
        { id: "c3", companyId: "company-b" },
      ]);
      contracts.refreshDocusignStatus
        .mockResolvedValueOnce({ status: "signed" })
        .mockResolvedValueOnce({ status: "sent" })
        .mockResolvedValueOnce({ status: "void" });

      const result = await service.runDuePass();

      expect(contracts.refreshDocusignStatus).toHaveBeenCalledTimes(3);
      expect(contracts.refreshDocusignStatus).toHaveBeenNthCalledWith(1, "company-a", "c1");
      expect(contracts.refreshDocusignStatus).toHaveBeenNthCalledWith(2, "company-a", "c2");
      expect(contracts.refreshDocusignStatus).toHaveBeenNthCalledWith(3, "company-b", "c3");
      expect(result).toEqual({ checked: 3, signed: 1, voided: 1 });
    });

    it("keeps going past a single contract's failure (e.g. a revoked DocuSign connection) instead of aborting the whole sweep", async () => {
      prisma.contract.findMany.mockResolvedValue([
        { id: "c1", companyId: "company-a" },
        { id: "c2", companyId: "company-a" },
      ]);
      contracts.refreshDocusignStatus
        .mockRejectedValueOnce(new Error("No DocuSign account connected"))
        .mockResolvedValueOnce({ status: "signed" });

      const result = await service.runDuePass();

      expect(contracts.refreshDocusignStatus).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ checked: 2, signed: 1, voided: 0 });
    });
  });
});
