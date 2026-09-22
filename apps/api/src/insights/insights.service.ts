import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { BudgetService } from "../finance/budget.service";
import { ProjectAccessService, type ProjectViewer } from "../common/project-access/project-access.service";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface TriageItem {
  kind: "rfi" | "punch_list_item";
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  score: number;
  ageDays: number;
  link: string;
}

/**
 * Heuristic prioritization over data the company already has — not a real ML model. Every
 * factor here is something a foreman would already weigh mentally (how old, how costly, whether
 * it's already been escalated); this just turns it into one sortable number instead of leaving
 * everyone to eyeball a flat list.
 */
@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly budget: BudgetService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async triage(companyId: string, limit = 20, viewer: ProjectViewer = {}): Promise<TriageItem[]> {
    const now = Date.now();
    const [visibleRfis, visiblePunch] = await Promise.all([
      this.projectAccess.visibleWhere(companyId, "Rfi", viewer.userId, viewer.role),
      this.projectAccess.visibleWhere(companyId, "PunchListItem", viewer.userId, viewer.role),
    ]);

    const [rfis, punchItems] = await Promise.all([
      this.prisma.rfi.findMany({
        where: { AND: [{ companyId, status: "open" }, visibleRfis] },
        include: { project: { select: { id: true, name: true } } },
      }),
      this.prisma.punchListItem.findMany({
        where: { AND: [{ companyId, status: "open" }, visiblePunch] },
        include: { project: { select: { id: true, name: true } } },
      }),
    ]);

    const rfiItems: TriageItem[] = rfis.map((r) => {
      const ageDays = (now - r.createdAt.getTime()) / DAY_MS;
      const priorityWeight = r.priority === "high" ? 40 : r.priority === "medium" ? 20 : 5;
      const dueWeight = r.dueDate && r.dueDate.getTime() < now ? 25 : 0;
      const impactWeight = (r.costImpact ? 15 : 0) + (r.scheduleImpactDays ? Math.min(r.scheduleImpactDays * 2, 20) : 0);
      const score = Math.min(100, priorityWeight + dueWeight + impactWeight + Math.min(ageDays, 20));
      return {
        kind: "rfi" as const,
        id: r.id,
        projectId: r.project.id,
        projectName: r.project.name,
        title: `${r.number}: ${r.subject}`,
        score: Math.round(score),
        ageDays: Math.round(ageDays),
        link: `/projects/${r.project.id}`,
      };
    });

    const punchListItems: TriageItem[] = punchItems.map((p) => {
      const ageDays = (now - p.createdAt.getTime()) / DAY_MS;
      const dueWeight = p.dueDate && p.dueDate.getTime() < now ? 25 : 0;
      const escalatedWeight = p.escalatedAt ? 30 : 0;
      const score = Math.min(100, dueWeight + escalatedWeight + Math.min(ageDays * 2, 40));
      return {
        kind: "punch_list_item" as const,
        id: p.id,
        projectId: p.project.id,
        projectName: p.project.name,
        title: p.title,
        score: Math.round(score),
        ageDays: Math.round(ageDays),
        link: `/projects/${p.project.id}`,
      };
    });

    return [...rfiItems, ...punchListItems].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** A single 0-100 score for "is this project okay?", built from budget consumption and open
   * quality-issue counts — the same signals a PM would check individually, combined into one
   * number so a portfolio view doesn't require opening every project. */
  async projectHealth(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");

    const [budget, openRfiCount, openPunchCount] = await Promise.all([
      this.budget.getForProject(companyId, projectId),
      this.prisma.rfi.count({ where: { companyId, projectId, status: "open" } }),
      this.prisma.punchListItem.count({ where: { companyId, projectId, status: "open" } }),
    ]);

    let score = 100;
    const factors: { label: string; penalty: number }[] = [];

    if (budget.grandTotalBudget > 0) {
      const ratio = (budget.materialsCostActual + budget.laborCostActual + budget.subcontractorCostActual) / budget.grandTotalBudget;
      if (ratio >= 1) {
        factors.push({ label: "Over budget", penalty: 40 });
      } else if (ratio >= 0.9) {
        factors.push({ label: "Near budget limit", penalty: 20 });
      }
    }
    if (openRfiCount > 0) factors.push({ label: `${openRfiCount} open RFI${openRfiCount > 1 ? "s" : ""}`, penalty: Math.min(openRfiCount * 5, 20) });
    if (openPunchCount > 0) {
      factors.push({ label: `${openPunchCount} open punch item${openPunchCount > 1 ? "s" : ""}`, penalty: Math.min(openPunchCount * 3, 20) });
    }

    score -= factors.reduce((sum, f) => sum + f.penalty, 0);
    score = Math.max(0, score);

    const band = score >= 80 ? "good" : score >= 50 ? "watch" : "at_risk";
    return { score, band, factors };
  }
}
