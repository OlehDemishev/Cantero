import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CompleteEnrollmentInput, CreateTrainingCourseInput, EnrollWorkerInput, UpdateTrainingCourseInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class TrainingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listCourses(companyId: string) {
    return this.prisma.trainingCourse.findMany({
      where: { companyId },
      include: { _count: { select: { enrollments: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async createCourse(companyId: string, actor: AuditActor, input: CreateTrainingCourseInput) {
    const course = await this.prisma.trainingCourse.create({
      data: {
        companyId,
        title: input.title,
        description: input.description,
        category: input.category,
        validityMonths: input.validityMonths,
      },
    });
    this.audit.record(companyId, actor, "training_course.created", "TrainingCourse", course.id, `Added training course "${input.title}"`);
    return course;
  }

  async updateCourse(companyId: string, actor: AuditActor, id: string, input: UpdateTrainingCourseInput) {
    const existing = await this.findCourseOrThrow(companyId, id);
    const updated = await this.prisma.trainingCourse.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        category: input.category,
        validityMonths: input.validityMonths,
      },
    });
    this.audit.record(companyId, actor, "training_course.updated", "TrainingCourse", id, `Updated training course "${existing.title}"`);
    return updated;
  }

  async deleteCourse(companyId: string, actor: AuditActor, id: string) {
    const existing = await this.findCourseOrThrow(companyId, id);
    await this.prisma.trainingCourse.delete({ where: { id } });
    this.audit.record(companyId, actor, "training_course.deleted", "TrainingCourse", id, `Deleted training course "${existing.title}"`);
    return { ok: true };
  }

  listEnrollments(companyId: string, courseId: string) {
    return this.prisma.trainingEnrollment.findMany({
      where: { companyId, courseId },
      include: { worker: { select: { id: true, name: true } } },
      orderBy: { enrolledAt: "desc" },
    });
  }

  listForWorker(companyId: string, workerId: string) {
    return this.prisma.trainingEnrollment.findMany({
      where: { companyId, workerId },
      include: { course: { select: { id: true, title: true, validityMonths: true } } },
      orderBy: { enrolledAt: "desc" },
    });
  }

  async enroll(companyId: string, actor: AuditActor, courseId: string, input: EnrollWorkerInput) {
    const course = await this.findCourseOrThrow(companyId, courseId);
    const worker = await this.prisma.worker.findFirst({ where: { id: input.workerId, companyId } });
    if (!worker) throw new NotFoundException("Worker not found");

    const existing = await this.prisma.trainingEnrollment.findFirst({
      where: { companyId, courseId, workerId: input.workerId, status: "enrolled" },
    });
    if (existing) throw new BadRequestException("Worker is already enrolled in this course");

    const enrollment = await this.prisma.trainingEnrollment.create({
      data: { companyId, courseId, workerId: input.workerId },
    });
    this.audit.record(companyId, actor, "training_enrollment.created", "TrainingEnrollment", enrollment.id, `Enrolled ${worker.name} in "${course.title}"`);
    return enrollment;
  }

  /** Marking an enrollment complete auto-issues (or renews) a matching WorkerCertification when
   * the course has a validityMonths — same expiry-tracking record the certifications dashboard
   * and its expiry notifications already cover, so a completed course shows up there too without
   * a second, parallel expiry pipeline. */
  async complete(companyId: string, actor: AuditActor, id: string, input: CompleteEnrollmentInput) {
    const enrollment = await this.prisma.trainingEnrollment.findFirst({
      where: { id, companyId },
      include: { course: true, worker: true },
    });
    if (!enrollment) throw new NotFoundException("Enrollment not found");
    if (enrollment.status === "completed") throw new BadRequestException("Enrollment is already completed");

    const completedAt = new Date();
    const updated = await this.prisma.trainingEnrollment.update({
      where: { id },
      data: { status: "completed", completedAt, score: input.score, notes: input.notes },
    });

    if (enrollment.course.validityMonths) {
      const expiresAt = new Date(completedAt);
      expiresAt.setMonth(expiresAt.getMonth() + enrollment.course.validityMonths);
      const existingCert = await this.prisma.workerCertification.findFirst({
        where: { companyId, workerId: enrollment.workerId, name: enrollment.course.title },
      });
      if (existingCert) {
        await this.prisma.workerCertification.update({ where: { id: existingCert.id }, data: { expiresAt } });
      } else {
        await this.prisma.workerCertification.create({
          data: { companyId, workerId: enrollment.workerId, name: enrollment.course.title, expiresAt },
        });
      }
    }

    this.audit.record(
      companyId,
      actor,
      "training_enrollment.completed",
      "TrainingEnrollment",
      id,
      `${enrollment.worker.name} completed "${enrollment.course.title}"`,
    );
    return updated;
  }

  /** Every course × every active worker who hasn't completed it — the compliance-gap view a
   * training manager scans to see who still needs to take what. */
  async complianceGaps(companyId: string) {
    const [courses, workers, completions] = await Promise.all([
      this.prisma.trainingCourse.findMany({ where: { companyId } }),
      this.prisma.worker.findMany({ where: { companyId, active: true }, select: { id: true, name: true } }),
      this.prisma.trainingEnrollment.findMany({ where: { companyId, status: "completed" }, select: { workerId: true, courseId: true } }),
    ]);
    const completedSet = new Set(completions.map((e) => `${e.workerId}:${e.courseId}`));

    return courses.map((course) => ({
      courseId: course.id,
      courseTitle: course.title,
      totalActiveWorkers: workers.length,
      missingWorkers: workers.filter((w) => !completedSet.has(`${w.id}:${course.id}`)).map((w) => ({ workerId: w.id, workerName: w.name })),
    }));
  }

  private async findCourseOrThrow(companyId: string, id: string) {
    const course = await this.prisma.trainingCourse.findFirst({ where: { id, companyId } });
    if (!course) throw new NotFoundException("Training course not found");
    return course;
  }
}
