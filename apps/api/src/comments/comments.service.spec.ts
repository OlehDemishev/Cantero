import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { CommentsService } from "./comments.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Foreman" };

describe("CommentsService", () => {
  let service: CommentsService;
  let prisma: {
    task: { findFirst: jest.Mock };
    rfi: { findFirst: jest.Mock };
    punchListItem: { findFirst: jest.Mock };
    project: { findFirst: jest.Mock };
    membership: { findMany: jest.Mock };
    comment: { findMany: jest.Mock; create: jest.Mock };
  };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = {
      task: { findFirst: jest.fn() },
      rfi: { findFirst: jest.fn() },
      punchListItem: { findFirst: jest.fn() },
      project: { findFirst: jest.fn() },
      membership: { findMany: jest.fn() },
      comment: { findMany: jest.fn(), create: jest.fn() },
    };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [CommentsService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(CommentsService);
  });

  describe("list()", () => {
    it("rejects when the target RFI does not belong to this company", async () => {
      prisma.rfi.findFirst.mockResolvedValue(null);

      await expect(service.list(COMPANY_A, { rfiId: "rfi-1" })).rejects.toThrow(NotFoundException);
      expect(prisma.comment.findMany).not.toHaveBeenCalled();
    });
  });

  describe("create()", () => {
    it("rejects when the target punch list item does not belong to this company", async () => {
      prisma.punchListItem.findFirst.mockResolvedValue(null);

      await expect(
        service.create(COMPANY_A, ACTOR, { punchListItemId: "item-1", content: "Looks good" }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.comment.create).not.toHaveBeenCalled();
    });

    it("drops a mentioned user id that isn't actually a member of this company", async () => {
      prisma.task.findFirst.mockResolvedValue({ id: "task-1" });
      prisma.membership.findMany.mockResolvedValue([{ userId: "real-member" }]);
      prisma.comment.create.mockResolvedValue({ id: "comment-1", mentions: [] });

      await service.create(COMPANY_A, ACTOR, {
        taskId: "task-1",
        content: "Check this @someone",
        mentionedUserIds: ["real-member", "not-a-member"],
      });

      expect(prisma.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mentions: { create: [{ userId: "real-member" }] } }),
        }),
      );
    });

    it("records an audit entry on success", async () => {
      prisma.rfi.findFirst.mockResolvedValue({ id: "rfi-1" });
      prisma.comment.create.mockResolvedValue({ id: "comment-1", mentions: [] });

      await service.create(COMPANY_A, ACTOR, { rfiId: "rfi-1", content: "Answered in the field" });

      expect(audit.record).toHaveBeenCalledWith(COMPANY_A, ACTOR, "comment.created", "Comment", "comment-1", expect.any(String));
    });

    it("posts to a project-wide channel when projectId is given", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1", companyId: COMPANY_A });
      prisma.comment.create.mockResolvedValue({ id: "comment-1", mentions: [] });

      await service.create(COMPANY_A, ACTOR, { projectId: "project-1", content: "Site update for everyone" });

      expect(prisma.comment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ projectId: "project-1" }) }),
      );
    });

    it("rejects when the target project does not belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.create(COMPANY_A, ACTOR, { projectId: "project-x", content: "Hi" })).rejects.toThrow(NotFoundException);
      expect(prisma.comment.create).not.toHaveBeenCalled();
    });
  });
});
