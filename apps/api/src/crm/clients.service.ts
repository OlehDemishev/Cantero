import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreateClientInput, UpdateClientInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.client.findMany({ where: { companyId }, orderBy: { name: "asc" } });
  }

  async get(companyId: string, id: string) {
    const client = await this.prisma.client.findFirst({ where: { id, companyId } });
    if (!client) throw new NotFoundException("Client not found");
    return client;
  }

  create(companyId: string, input: CreateClientInput) {
    return this.prisma.client.create({ data: { ...input, companyId } });
  }

  async update(companyId: string, id: string, input: UpdateClientInput) {
    await this.get(companyId, id);
    return this.prisma.client.update({ where: { id }, data: input });
  }
}
