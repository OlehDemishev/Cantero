import { Injectable } from "@nestjs/common";
import type { CreateSubcontractorInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class SubcontractorsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.subcontractor.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  }

  create(companyId: string, input: CreateSubcontractorInput) {
    return this.prisma.subcontractor.create({ data: { ...input, companyId } });
  }
}
