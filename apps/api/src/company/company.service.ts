import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { UpdateCompanyInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { StorageService } from "../common/storage/storage.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";

const MAX_LOGO_SIZE_BYTES = 1 * 1024 * 1024; // 1MB — a logo, not a photo
// pdfkit only rasterizes JPEG/PNG, so SVG (however common for logos) isn't accepted here.
const ALLOWED_LOGO_MIME_TYPES = new Set(["image/png", "image/jpeg"]);

@Injectable()
export class CompanyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  get(companyId: string) {
    return this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
  }

  async update(companyId: string, actor: AuditActor, input: UpdateCompanyInput) {
    const updated = await this.prisma.company.update({ where: { id: companyId }, data: input });
    this.audit.record(companyId, actor, "company.settings_updated", "Company", companyId, "Updated company settings", input);
    return updated;
  }

  async completeOnboarding(companyId: string, actor: AuditActor) {
    const updated = await this.prisma.company.update({ where: { id: companyId }, data: { onboardingCompletedAt: new Date() } });
    this.audit.record(companyId, actor, "company.onboarding_completed", "Company", companyId, "Completed onboarding setup");
    return updated;
  }

  async uploadLogo(companyId: string, actor: AuditActor, file: Express.Multer.File) {
    if (file.size > MAX_LOGO_SIZE_BYTES) throw new BadRequestException("Logo exceeds the 1MB limit");
    if (!ALLOWED_LOGO_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`Logo must be PNG or JPEG (got "${file.mimetype}")`);
    }

    const stored = await this.storage.save(companyId, file.originalname, file.buffer);
    await this.prisma.company.update({
      where: { id: companyId },
      data: { logoStorageKey: stored.storageKey, logoMimeType: file.mimetype },
    });
    this.audit.record(companyId, actor, "company.logo_updated", "Company", companyId, "Updated company logo");
    return { ok: true };
  }

  async getLogo(companyId: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    if (!company.logoStorageKey) throw new NotFoundException("No logo uploaded");
    const buffer = await this.storage.read(company.logoStorageKey);
    return { buffer, mimeType: company.logoMimeType ?? "image/png" };
  }
}
