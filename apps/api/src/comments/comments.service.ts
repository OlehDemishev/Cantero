import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateCommentInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

export interface CommentListFilter {
  taskId?: string;
  rfiId?: string;
  punchListItemId?: string;
  projectId?: string;
}

/** Not cursor-paginated: CommentsThread renders oldest-first like a chat log, where the natural
 * "more" direction is loading older messages above the visible ones, not appending a next page
 * below — a different UX than the flat lists elsewhere in this app. A single task/RFI/punch-list
 * thread is inherently small; only the projectId-scoped view (every comment on the project) can
 * really grow over a project's lifetime, so this cap is a backstop for that view rather than an
 * expected page size. */
const COMMENTS_QUERY_CAP = 500;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(companyId: string, filter: CommentListFilter) {
    await this.assertTarget(companyId, filter);
    // Capped at the most recent COMMENTS_QUERY_CAP comments — fetched newest-first so the cap
    // keeps recent activity (not the oldest messages ever posted), then reversed back to the
    // oldest-first order the thread UI expects.
    const comments = await this.prisma.comment.findMany({
      where: {
        companyId,
        ...(filter.taskId ? { taskId: filter.taskId } : {}),
        ...(filter.rfiId ? { rfiId: filter.rfiId } : {}),
        ...(filter.punchListItemId ? { punchListItemId: filter.punchListItemId } : {}),
        ...(filter.projectId ? { projectId: filter.projectId } : {}),
      },
      include: { mentions: { include: { user: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: COMMENTS_QUERY_CAP,
    });
    return comments.reverse();
  }

  async create(companyId: string, actor: AuditActor, input: CreateCommentInput) {
    await this.assertTarget(companyId, input);
    const mentionUserIds = await this.filterCompanyMemberIds(companyId, input.mentionedUserIds ?? []);

    const comment = await this.prisma.comment.create({
      data: {
        companyId,
        authorUserId: actor.userId,
        authorName: actor.name,
        content: input.content,
        taskId: input.taskId,
        rfiId: input.rfiId,
        punchListItemId: input.punchListItemId,
        projectId: input.projectId,
        mentions: { create: mentionUserIds.map((userId) => ({ userId })) },
      },
      include: { mentions: { include: { user: { select: { id: true, name: true } } } } },
    });
    this.audit.record(companyId, actor, "comment.created", "Comment", comment.id, `Commented: "${input.content.slice(0, 80)}"`);
    return comment;
  }

  private async assertTarget(companyId: string, target: CommentListFilter) {
    if (target.taskId) {
      const task = await this.prisma.task.findFirst({ where: { id: target.taskId, project: { companyId } } });
      if (!task) throw new NotFoundException("Task not found");
    }
    if (target.rfiId) {
      const rfi = await this.prisma.rfi.findFirst({ where: { id: target.rfiId, companyId } });
      if (!rfi) throw new NotFoundException("RFI not found");
    }
    if (target.punchListItemId) {
      const item = await this.prisma.punchListItem.findFirst({ where: { id: target.punchListItemId, companyId } });
      if (!item) throw new NotFoundException("Punch list item not found");
    }
    if (target.projectId) {
      const project = await this.prisma.project.findFirst({ where: { id: target.projectId, companyId } });
      if (!project) throw new NotFoundException("Project not found");
    }
  }

  /** Silently drops any id that isn't actually a member of this company, rather than erroring the whole comment. */
  private async filterCompanyMemberIds(companyId: string, userIds: string[]): Promise<string[]> {
    if (userIds.length === 0) return [];
    const memberships = await this.prisma.membership.findMany({
      where: { companyId, userId: { in: userIds } },
      select: { userId: true },
    });
    return memberships.map((m) => m.userId);
  }
}
