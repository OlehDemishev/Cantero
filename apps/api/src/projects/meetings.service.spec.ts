import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { MeetingsService } from "./meetings.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";
import { PdfService } from "../common/pdf/pdf.service";
import { StorageService } from "../common/storage/storage.service";

const COMPANY_A = "company-a";
const PROJECT_A = "project-a";
const ACTOR = { userId: "user-1", name: "PM" };

describe("MeetingsService", () => {
  let service: MeetingsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    meeting: { findMany: jest.Mock; findFirst: jest.Mock; count: jest.Mock; create: jest.Mock };
    meetingActionItem: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      meeting: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn(), create: jest.fn() },
      meetingActionItem: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        MeetingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: PdfService, useValue: { render: jest.fn(), renderTextDocument: jest.fn() } },
        { provide: StorageService, useValue: { read: jest.fn() } },
      ],
    }).compile();

    service = module.get(MeetingsService);
  });

  describe("create()", () => {
    it("rejects a meeting for a project that doesn't belong to the company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(
        service.create(COMPANY_A, ACTOR, { projectId: PROJECT_A, title: "OAC #1", meetingDate: "2026-09-10T00:00:00Z", attendees: [], actionItems: [] }),
      ).rejects.toThrow(NotFoundException);
    });

    it("numbers a new meeting sequentially per project", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A, name: "Tower" });
      prisma.meeting.count.mockResolvedValue(3);
      prisma.meeting.create.mockResolvedValue({ id: "m-4", number: 4 });

      await service.create(COMPANY_A, ACTOR, { projectId: PROJECT_A, title: "OAC #4", meetingDate: "2026-09-10T00:00:00Z", attendees: ["Jane"], actionItems: [] });

      expect(prisma.meeting.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ number: 4 }) }));
    });

    it("creates nested action items", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: PROJECT_A, name: "Tower" });
      prisma.meeting.count.mockResolvedValue(0);
      prisma.meeting.create.mockResolvedValue({ id: "m-1", number: 1 });

      await service.create(COMPANY_A, ACTOR, {
        projectId: PROJECT_A,
        title: "OAC #1",
        meetingDate: "2026-09-10T00:00:00Z",
        attendees: [],
        actionItems: [{ description: "Confirm curtain wall submittal date", ownerName: "Architect" }],
      });

      const createCall = prisma.meeting.create.mock.calls[0][0];
      expect(createCall.data.actionItems.create).toEqual([{ description: "Confirm curtain wall submittal date", ownerName: "Architect", dueDate: undefined }]);
    });
  });

  describe("resolveActionItem()", () => {
    it("throws when the action item doesn't belong to the company", async () => {
      prisma.meetingActionItem.findFirst.mockResolvedValue(null);
      await expect(service.resolveActionItem(COMPANY_A, ACTOR, "item-1", { resolvedByName: "Jane" })).rejects.toThrow(NotFoundException);
    });

    it("rejects resolving an already-resolved item", async () => {
      prisma.meetingActionItem.findFirst.mockResolvedValue({ id: "item-1", status: "done", meeting: { number: 1 } });
      await expect(service.resolveActionItem(COMPANY_A, ACTOR, "item-1", { resolvedByName: "Jane" })).rejects.toThrow(BadRequestException);
    });

    it("stamps resolvedAt and resolvedByName", async () => {
      prisma.meetingActionItem.findFirst.mockResolvedValue({ id: "item-1", status: "open", description: "Follow up", meeting: { number: 1 } });
      prisma.meetingActionItem.update.mockResolvedValue({ id: "item-1", status: "done", resolvedByName: "Jane" });

      const result = await service.resolveActionItem(COMPANY_A, ACTOR, "item-1", { resolvedByName: "Jane" });

      expect(result.resolvedByName).toBe("Jane");
      const updateCall = prisma.meetingActionItem.update.mock.calls[0][0];
      expect(updateCall.data.resolvedAt).toBeInstanceOf(Date);
      expect(updateCall.data.status).toBe("done");
    });
  });

  describe("openActionItems()", () => {
    it("queries only open items scoped to the project", async () => {
      prisma.meetingActionItem.findMany.mockResolvedValue([]);
      await service.openActionItems(COMPANY_A, PROJECT_A);
      expect(prisma.meetingActionItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: "open", meeting: { companyId: COMPANY_A, projectId: PROJECT_A } } }),
      );
    });
  });
});
