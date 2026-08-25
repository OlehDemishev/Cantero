import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateServiceContractInput, UpdateServiceContractInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

@Injectable()
export class ServiceContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(companyId: string) {
    return this.prisma.serviceContract.findMany({
      where: { companyId },
      include: { project: { select: { id: true, name: true } }, client: { select: { id: true, name: true } }, visits: true },
      orderBy: { nextVisitDate: "asc" },
    });
  }

  async get(companyId: string, id: string) {
    const contract = await this.prisma.serviceContract.findFirst({
      where: { id, companyId },
      include: {
        project: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        visits: { orderBy: { scheduledDate: "desc" }, include: { technician: { select: { id: true, name: true } } } },
      },
    });
    if (!contract) throw new NotFoundException("Service contract not found");
    return contract;
  }

  async create(companyId: string, actor: AuditActor, input: CreateServiceContractInput) {
    const [project, client] = await Promise.all([
      this.prisma.project.findFirst({ where: { id: input.projectId, companyId } }),
      this.prisma.client.findFirst({ where: { id: input.clientId, companyId } }),
    ]);
    if (!project) throw new NotFoundException("Project not found");
    if (!client) throw new NotFoundException("Client not found");

    const startDate = new Date(input.startDate);
    const contract = await this.prisma.serviceContract.create({
      data: {
        companyId,
        projectId: input.projectId,
        clientId: input.clientId,
        title: input.title,
        frequencyMonths: input.frequencyMonths,
        startDate,
        nextVisitDate: startDate,
        notes: input.notes,
      },
    });
    this.audit.record(companyId, actor, "service_contract.created", "ServiceContract", contract.id, `Created service contract "${input.title}"`);
    return contract;
  }

  async update(companyId: string, actor: AuditActor, id: string, input: UpdateServiceContractInput) {
    await this.get(companyId, id);
    const updated = await this.prisma.serviceContract.update({ where: { id }, data: input });
    this.audit.record(companyId, actor, "service_contract.updated", "ServiceContract", id, `Updated service contract "${updated.title}"`);
    return updated;
  }
}
