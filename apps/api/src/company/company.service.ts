import { Injectable } from "@nestjs/common";
import type { UpdateCompanyInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  get(companyId: string) {
    return this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  }

  update(companyId: string, input: UpdateCompanyInput) {
    return this.prisma.company.update({ where: { id: companyId }, data: input });
  }
}
