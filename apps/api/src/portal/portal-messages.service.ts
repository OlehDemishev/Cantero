import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import type { AuditActor } from "../common/audit/audit.service";
import type { PortalClientContext } from "./portal-jwt.service";

/**
 * A per-project message thread visible to both the assigned client (through the portal) and
 * internal staff — deliberately backed by its own PortalMessage model rather than the internal
 * Comment system, so nothing written in an internal-only comment thread can ever leak across the
 * portal boundary. Both sides read/write the exact same rows; only the authorization check and
 * which author field gets stamped differ.
 */
@Injectable()
export class PortalMessagesService {
  constructor(private readonly prisma: PrismaService) {}

  async listForClient(client: PortalClientContext, projectId: string) {
    await this.assertClientProject(client, projectId);
    return this.prisma.portalMessage.findMany({ where: { companyId: client.companyId, projectId }, orderBy: { createdAt: "asc" } });
  }

  async createForClient(client: PortalClientContext, projectId: string, content: string) {
    await this.assertClientProject(client, projectId);
    const record = await this.prisma.client.findUniqueOrThrow({ where: { id: client.clientId }, select: { name: true } });
    return this.prisma.portalMessage.create({
      data: { companyId: client.companyId, projectId, authorClientId: client.clientId, authorName: record.name, content },
    });
  }

  async listForStaff(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    return this.prisma.portalMessage.findMany({ where: { companyId, projectId }, orderBy: { createdAt: "asc" } });
  }

  async createForStaff(companyId: string, actor: AuditActor, projectId: string, content: string) {
    await this.assertProject(companyId, projectId);
    return this.prisma.portalMessage.create({
      data: { companyId, projectId, authorUserId: actor.userId, authorName: actor.name, content },
    });
  }

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
  }

  private async assertClientProject(client: PortalClientContext, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId: client.companyId, clientId: client.clientId },
    });
    if (!project) throw new NotFoundException("Project not found");
  }
}
