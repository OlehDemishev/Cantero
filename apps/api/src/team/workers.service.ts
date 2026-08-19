import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateWorkerInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class WorkersService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.worker.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  }

  async get(companyId: string, id: string) {
    const worker = await this.prisma.worker.findFirst({ where: { id, companyId } });
    if (!worker) throw new NotFoundException("Worker not found");
    return worker;
  }

  create(companyId: string, input: CreateWorkerInput) {
    return this.prisma.worker.create({ data: { ...input, companyId } });
  }
}
