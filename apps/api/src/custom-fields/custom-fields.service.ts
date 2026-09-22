import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { CreateCustomFieldDefinitionInput, CustomFieldEntityType, SetCustomFieldValuesInput } from "@cantero/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService, type AuditActor } from "../common/audit/audit.service";
import { ProjectAccessService } from "../common/project-access/project-access.service";

/** Who is reading or writing values — a project's are subject to Project.restrictedToMembers. */
export interface CustomFieldViewer {
  userId?: string;
  role?: string;
}

@Injectable()
export class CustomFieldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  listDefinitions(companyId: string, entityType?: CustomFieldEntityType) {
    return this.prisma.customFieldDefinition.findMany({
      where: { companyId, ...(entityType ? { entityType } : {}) },
      orderBy: [{ entityType: "asc" }, { sortOrder: "asc" }],
    });
  }

  async createDefinition(companyId: string, actor: AuditActor, input: CreateCustomFieldDefinitionInput) {
    if (input.type === "select" && (!input.options || input.options.length === 0)) {
      throw new BadRequestException("A select field needs at least one option");
    }
    const count = await this.prisma.customFieldDefinition.count({ where: { companyId, entityType: input.entityType } });

    const field = await this.prisma.customFieldDefinition.create({
      data: {
        companyId,
        entityType: input.entityType,
        name: input.name,
        type: input.type,
        options: input.type === "select" ? input.options! : [],
        sortOrder: count,
      },
    });
    this.audit.record(companyId, actor, "custom_field.created", "CustomFieldDefinition", field.id, `Added "${input.name}" custom field for ${input.entityType}s`);
    return field;
  }

  async deleteDefinition(companyId: string, actor: AuditActor, id: string) {
    const field = await this.prisma.customFieldDefinition.findFirst({ where: { id, companyId } });
    if (!field) throw new NotFoundException("Custom field not found");
    await this.prisma.customFieldDefinition.delete({ where: { id } });
    this.audit.record(companyId, actor, "custom_field.deleted", "CustomFieldDefinition", id, `Removed "${field.name}" custom field`);
    return { ok: true };
  }

  /** Merges every definition for the entity type with this specific entity's stored values, so callers always get the full field list even before any value has been set. */
  async getValues(companyId: string, entityType: CustomFieldEntityType, entityId: string, viewer: CustomFieldViewer = {}) {
    await this.assertEntity(companyId, entityType, entityId, viewer);

    const definitions = await this.prisma.customFieldDefinition.findMany({
      where: { companyId, entityType },
      orderBy: { sortOrder: "asc" },
      include: { values: { where: { entityId } } },
    });
    return definitions.map((d) => ({
      fieldId: d.id,
      name: d.name,
      type: d.type,
      options: d.options,
      value: d.values[0]?.value ?? null,
    }));
  }

  async setValues(companyId: string, entityType: CustomFieldEntityType, entityId: string, input: SetCustomFieldValuesInput, viewer: CustomFieldViewer = {}) {
    await this.assertEntity(companyId, entityType, entityId, viewer);

    const fieldIds = input.values.map((v) => v.fieldId);
    const definitions = await this.prisma.customFieldDefinition.findMany({ where: { id: { in: fieldIds }, companyId, entityType } });
    if (definitions.length !== fieldIds.length) throw new BadRequestException("One or more custom fields not found");

    await this.prisma.$transaction(
      input.values.map((v) =>
        this.prisma.customFieldValue.upsert({
          where: { fieldId_entityId: { fieldId: v.fieldId, entityId } },
          create: { fieldId: v.fieldId, entityId, value: v.value },
          update: { value: v.value },
        }),
      ),
    );
    return this.getValues(companyId, entityType, entityId, viewer);
  }

  private async assertEntity(companyId: string, entityType: CustomFieldEntityType, entityId: string, viewer: CustomFieldViewer) {
    const exists =
      entityType === "project"
        ? await this.prisma.project.findFirst({ where: { id: entityId, companyId }, select: { id: true } })
        : await this.prisma.client.findFirst({ where: { id: entityId, companyId }, select: { id: true } });
    if (!exists) throw new NotFoundException(`${entityType === "project" ? "Project" : "Client"} not found`);
    // The route names the project `:entityId`, which ProjectAccessGuard can't know is a project.
    if (entityType === "project") await this.projectAccess.assertAccess(companyId, entityId, viewer.userId, viewer.role);
  }
}
