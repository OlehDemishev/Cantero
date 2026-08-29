import { Test } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { AnnotationsService } from "./annotations.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";
const SHEET_A = "sheet-a";
const ACTOR = { userId: "user-1", name: "Anke Müller" };

describe("AnnotationsService", () => {
  let service: AnnotationsService;
  let prisma: {
    drawingSheet: { findFirst: jest.Mock };
    annotation: { findMany: jest.Mock; create: jest.Mock; findFirst: jest.Mock; delete: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      drawingSheet: { findFirst: jest.fn() },
      annotation: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), delete: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [AnnotationsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(AnnotationsService);
  });

  it("throws listing annotations for a sheet outside the caller's company", async () => {
    prisma.drawingSheet.findFirst.mockResolvedValue(null);
    await expect(service.list(COMPANY_A, SHEET_A)).rejects.toThrow(NotFoundException);
  });

  it("creates an annotation scoped to the sheet's company and records the author", async () => {
    prisma.drawingSheet.findFirst.mockResolvedValue({ id: SHEET_A, companyId: COMPANY_A });
    prisma.annotation.create.mockResolvedValue({ id: "ann-1" });

    await service.create(COMPANY_A, ACTOR, SHEET_A, {
      type: "rectangle",
      points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }],
      color: "#ff0000",
    });

    expect(prisma.annotation.create).toHaveBeenCalledWith({
      data: {
        companyId: COMPANY_A,
        drawingSheetId: SHEET_A,
        authorUserId: ACTOR.userId,
        authorName: ACTOR.name,
        type: "rectangle",
        points: [{ x: 0.1, y: 0.2 }, { x: 0.4, y: 0.5 }],
        color: "#ff0000",
        text: undefined,
      },
    });
  });

  it("throws deleting an annotation that doesn't belong to the caller's company", async () => {
    prisma.annotation.findFirst.mockResolvedValue(null);
    await expect(service.delete(COMPANY_A, "ann-1")).rejects.toThrow(NotFoundException);
    expect(prisma.annotation.delete).not.toHaveBeenCalled();
  });
});
