import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SavedViewsService } from "./saved-views.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";
const USER_A = "user-a";

describe("SavedViewsService", () => {
  let service: SavedViewsService;
  let prisma: {
    savedView: { findMany: jest.Mock; upsert: jest.Mock; findFirst: jest.Mock; delete: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      savedView: { findMany: jest.fn(), upsert: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [SavedViewsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(SavedViewsService);
  });

  describe("create()", () => {
    it("upserts by (userId, viewType, name), so saving under an existing name overwrites it", async () => {
      prisma.savedView.upsert.mockResolvedValue({ id: "view-1" });

      await service.create(COMPANY_A, USER_A, { viewType: "projects", name: "My open jobs", filters: { status: "open" } });

      expect(prisma.savedView.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_viewType_name: { userId: USER_A, viewType: "projects", name: "My open jobs" } },
        }),
      );
    });
  });

  describe("delete()", () => {
    it("rejects deleting a view that belongs to a different user", async () => {
      prisma.savedView.findFirst.mockResolvedValue(null);

      await expect(service.delete(COMPANY_A, USER_A, "view-1")).rejects.toThrow(NotFoundException);
      expect(prisma.savedView.delete).not.toHaveBeenCalled();
    });
  });
});
