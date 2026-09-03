import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AddInterviewInput,
  ConvertCandidateToWorkerInput,
  CreateCandidateInput,
  CreateJobPostingInput,
  MoveCandidateStageInput,
  UpdateJobPostingInput,
} from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { WorkersService } from "../team/workers.service";

@Injectable()
export class RecruitingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly workers: WorkersService,
  ) {}

  listJobPostings(companyId: string) {
    return this.prisma.jobPosting.findMany({
      where: { companyId },
      include: { _count: { select: { candidates: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async createJobPosting(companyId: string, actor: AuditActor, input: CreateJobPostingInput) {
    const posting = await this.prisma.jobPosting.create({
      data: { companyId, title: input.title, trade: input.trade, location: input.location, description: input.description },
    });
    this.audit.record(companyId, actor, "job_posting.created", "JobPosting", posting.id, `Opened job posting "${input.title}"`);
    return posting;
  }

  async updateJobPosting(companyId: string, actor: AuditActor, id: string, input: UpdateJobPostingInput) {
    const existing = await this.findPostingOrThrow(companyId, id);
    const updated = await this.prisma.jobPosting.update({
      where: { id },
      data: { title: input.title, trade: input.trade, location: input.location, description: input.description, status: input.status },
    });
    this.audit.record(companyId, actor, "job_posting.updated", "JobPosting", id, `Updated job posting "${existing.title}"`);
    return updated;
  }

  listCandidates(companyId: string, jobPostingId: string) {
    return this.prisma.candidate.findMany({
      where: { companyId, jobPostingId },
      orderBy: { createdAt: "desc" },
    });
  }

  async get(companyId: string, id: string) {
    const candidate = await this.findCandidateOrThrow(companyId, id);
    const interviews = await this.prisma.interview.findMany({ where: { candidateId: id }, orderBy: { createdAt: "desc" } });
    return { ...candidate, interviews };
  }

  async createCandidate(companyId: string, actor: AuditActor, jobPostingId: string, input: CreateCandidateInput) {
    const posting = await this.findPostingOrThrow(companyId, jobPostingId);
    const candidate = await this.prisma.candidate.create({
      data: { companyId, jobPostingId, name: input.name, email: input.email, phone: input.phone, source: input.source, notes: input.notes },
    });
    this.audit.record(companyId, actor, "candidate.created", "Candidate", candidate.id, `Added candidate ${input.name} for "${posting.title}"`);
    return candidate;
  }

  async moveStage(companyId: string, actor: AuditActor, id: string, input: MoveCandidateStageInput) {
    const candidate = await this.findCandidateOrThrow(companyId, id);
    if (candidate.stage === "hired") throw new BadRequestException("This candidate has already been hired");
    const updated = await this.prisma.candidate.update({ where: { id }, data: { stage: input.stage } });
    this.audit.record(companyId, actor, "candidate.stage_changed", "Candidate", id, `Moved ${candidate.name} to ${input.stage}`);
    return updated;
  }

  async addInterview(companyId: string, actor: AuditActor, id: string, input: AddInterviewInput) {
    const candidate = await this.findCandidateOrThrow(companyId, id);
    const interview = await this.prisma.interview.create({
      data: {
        companyId,
        candidateId: id,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
        interviewerName: input.interviewerName,
        notes: input.notes,
        rating: input.rating,
      },
    });
    this.audit.record(companyId, actor, "interview.logged", "Interview", interview.id, `Logged interview for ${candidate.name}`);
    return interview;
  }

  /** Reuses WorkersService.create() so the new hire gets the same onboarding-template clone as
   * any other worker, rather than duplicating that logic here. */
  async convertToWorker(companyId: string, actor: AuditActor, id: string, input: ConvertCandidateToWorkerInput) {
    const candidate = await this.findCandidateOrThrow(companyId, id);
    if (candidate.hiredWorkerId) throw new BadRequestException("This candidate has already been converted to a worker");

    const worker = await this.workers.create(companyId, {
      name: candidate.name,
      role: input.role,
      hourlyCost: input.hourlyCost,
      phone: candidate.phone ?? undefined,
    });
    await this.prisma.candidate.update({ where: { id }, data: { stage: "hired", hiredWorkerId: worker.id } });
    this.audit.record(companyId, actor, "candidate.hired", "Candidate", id, `Converted candidate ${candidate.name} to worker`, { workerId: worker.id });
    return worker;
  }

  private async findPostingOrThrow(companyId: string, id: string) {
    const posting = await this.prisma.jobPosting.findFirst({ where: { id, companyId } });
    if (!posting) throw new NotFoundException("Job posting not found");
    return posting;
  }

  private async findCandidateOrThrow(companyId: string, id: string) {
    const candidate = await this.prisma.candidate.findFirst({ where: { id, companyId } });
    if (!candidate) throw new NotFoundException("Candidate not found");
    return candidate;
  }
}
