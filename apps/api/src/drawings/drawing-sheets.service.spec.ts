import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DrawingSheetsService } from "./drawing-sheets.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const PROJECT_A = "project-a";
const ACTOR = { userId: "user-1", name: "Anke Müller" };

function pdfFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: "file",
    originalname: "sheet-a101.pdf",
    mimetype: "application/pdf",
    size: 1024,
    buffer: Buffer.from("fake-pdf"),
    ...overrides,
  } as Express.Multer.File;
}

describe("DrawingSheetsService.upload", () => {
  let service: DrawingSheetsService;
  let prisma: { project: { findFirst: jest.Mock }; drawingSheet: { create: jest.Mock; findFirst: jest.Mock } };
  let storage: { save: jest.Mock };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn().mockResolvedValue({ id: PROJECT_A }) },
      drawingSheet: { create: jest.fn(), findFirst: jest.fn() },
    };
    storage = { save: jest.fn().mockResolvedValue({ storageKey: "company-a/abc-sheet.pdf", size: 1024 }) };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        DrawingSheetsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(DrawingSheetsService);
  });

  it("rejects a file type outside the allowed PDF/image set", async () => {
    const file = pdfFile({ mimetype: "application/zip" });
    await expect(service.upload(COMPANY_A, ACTOR, PROJECT_A, file, { sheetNumber: "A-101" })).rejects.toThrow(BadRequestException);
    expect(storage.save).not.toHaveBeenCalled();
  });

  it("rejects a file over the 25MB limit", async () => {
    const file = pdfFile({ size: 30 * 1024 * 1024 });
    await expect(service.upload(COMPANY_A, ACTOR, PROJECT_A, file, { sheetNumber: "A-101" })).rejects.toThrow(BadRequestException);
  });

  it("throws when the project doesn't belong to the caller's company", async () => {
    prisma.project.findFirst.mockResolvedValue(null);
    await expect(service.upload(COMPANY_A, ACTOR, PROJECT_A, pdfFile(), { sheetNumber: "A-101" })).rejects.toThrow(NotFoundException);
  });

  it("stores the file and creates a sheet row with the uploaded mimeType", async () => {
    prisma.drawingSheet.create.mockResolvedValue({ id: "sheet-1", sheetNumber: "A-101" });
    await service.upload(COMPANY_A, ACTOR, PROJECT_A, pdfFile(), { sheetNumber: "A-101", discipline: "Architectural" });

    expect(storage.save).toHaveBeenCalledWith(COMPANY_A, "sheet-a101.pdf", expect.any(Buffer));
    expect(prisma.drawingSheet.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: COMPANY_A,
          projectId: PROJECT_A,
          sheetNumber: "A-101",
          discipline: "Architectural",
          storageKey: "company-a/abc-sheet.pdf",
          mimeType: "application/pdf",
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalled();
  });
});
