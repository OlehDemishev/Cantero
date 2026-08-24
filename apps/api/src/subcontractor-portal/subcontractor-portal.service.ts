import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { SignLienWaiverInput, SubmitSubcontractorCostInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { decodePngDataUrl } from "../common/signature";
import type { PortalSubcontractorContext } from "./subcontractor-portal-jwt.service";

@Injectable()
export class SubcontractorPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async me(subcontractor: PortalSubcontractorContext) {
    const record = await this.prisma.subcontractor.findUniqueOrThrow({
      where: { id: subcontractor.subcontractorId },
      include: { company: { select: { name: true, currency: true } } },
    });
    return { name: record.name, email: record.email, companyName: record.company.name, currency: record.company.currency };
  }

  listProjects(subcontractor: PortalSubcontractorContext) {
    return this.prisma.subcontractorAssignment.findMany({
      where: { subcontractorId: subcontractor.subcontractorId },
      include: { project: { select: { id: true, name: true, address: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  listCosts(subcontractor: PortalSubcontractorContext) {
    return this.prisma.subcontractorCost.findMany({
      where: { subcontractorId: subcontractor.subcontractorId },
      include: { project: { select: { name: true } } },
      orderBy: { incurredDate: "desc" },
    });
  }

  /** A subcontractor may only log a cost against a project they're explicitly assigned to. */
  async submitCost(subcontractor: PortalSubcontractorContext, input: SubmitSubcontractorCostInput) {
    const assignment = await this.prisma.subcontractorAssignment.findFirst({
      where: { subcontractorId: subcontractor.subcontractorId, projectId: input.projectId },
    });
    if (!assignment) throw new NotFoundException("You are not assigned to this project");

    return this.prisma.subcontractorCost.create({
      data: {
        companyId: subcontractor.companyId,
        subcontractorId: subcontractor.subcontractorId,
        projectId: input.projectId,
        description: input.description,
        amount: input.amount,
        incurredDate: input.incurredDate ? new Date(input.incurredDate) : undefined,
      },
      include: { project: { select: { name: true } } },
    });
  }

  listLienWaivers(subcontractor: PortalSubcontractorContext) {
    return this.prisma.lienWaiver.findMany({
      where: { subcontractorId: subcontractor.subcontractorId },
      include: { project: { select: { name: true } } },
      orderBy: { requestedAt: "desc" },
    });
  }

  async signLienWaiver(subcontractor: PortalSubcontractorContext, waiverId: string, input: SignLienWaiverInput, signerIp?: string) {
    const waiver = await this.prisma.lienWaiver.findFirst({
      where: { id: waiverId, subcontractorId: subcontractor.subcontractorId },
    });
    if (!waiver) throw new NotFoundException("Lien waiver not found");
    if (waiver.signedAt) throw new BadRequestException("This lien waiver has already been signed");

    const stored = await this.storage.save(subcontractor.companyId, "signature.png", decodePngDataUrl(input.signatureDataUrl));

    return this.prisma.lienWaiver.update({
      where: { id: waiverId },
      data: { signedAt: new Date(), signerName: input.signerName, signatureImageKey: stored.storageKey, signedIp: signerIp },
    });
  }
}
