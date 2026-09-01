import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateSiteSignInInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class SiteSignInsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string, projectId: string) {
    await this.assertProject(companyId, projectId);
    return this.prisma.siteSignIn.findMany({ where: { companyId, projectId }, orderBy: { signedInAt: "desc" } });
  }

  async signIn(companyId: string, projectId: string, input: CreateSiteSignInInput) {
    await this.assertProject(companyId, projectId);
    return this.prisma.siteSignIn.create({
      data: { companyId, projectId, name: input.name, visitorCompany: input.visitorCompany, purpose: input.purpose },
    });
  }

  async signOut(companyId: string, projectId: string, id: string) {
    const signIn = await this.prisma.siteSignIn.findFirst({ where: { id, companyId, projectId } });
    if (!signIn) throw new NotFoundException("Sign-in not found");
    if (signIn.signedOutAt) throw new BadRequestException("Already signed out");
    return this.prisma.siteSignIn.update({ where: { id }, data: { signedOutAt: new Date() } });
  }

  private async assertProject(companyId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId } });
    if (!project) throw new NotFoundException("Project not found");
  }
}
