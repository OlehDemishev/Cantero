import { Test } from "@nestjs/testing";
import { MarkupRulesService } from "./markup-rules.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditService } from "../common/audit/audit.service";

const COMPANY_A = "company-a";
const ACTOR = { userId: "user-1", name: "Owner" };

describe("MarkupRulesService", () => {
  let service: MarkupRulesService;
  let prisma: { markupRule: { findMany: jest.Mock; upsert: jest.Mock; deleteMany: jest.Mock } };
  let audit: { record: jest.Mock };

  beforeEach(async () => {
    prisma = { markupRule: { findMany: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() } };
    audit = { record: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [MarkupRulesService, { provide: PrismaService, useValue: prisma }, { provide: AuditService, useValue: audit }],
    }).compile();

    service = module.get(MarkupRulesService);
  });

  describe("set()", () => {
    it("upserts scoped to the company and cost type", async () => {
      prisma.markupRule.upsert.mockResolvedValue({ id: "rule-1", costType: "materials", markupPercent: 15 });

      await service.set(COMPANY_A, ACTOR, { costType: "materials", markupPercent: 15 });

      expect(prisma.markupRule.upsert).toHaveBeenCalledWith({
        where: { companyId_costType: { companyId: COMPANY_A, costType: "materials" } },
        create: { companyId: COMPANY_A, costType: "materials", markupPercent: 15 },
        update: { markupPercent: 15, active: true },
      });
    });

    it("records an audit entry", async () => {
      prisma.markupRule.upsert.mockResolvedValue({ id: "rule-1", costType: "labor", markupPercent: 25 });

      await service.set(COMPANY_A, ACTOR, { costType: "labor", markupPercent: 25 });

      expect(audit.record).toHaveBeenCalledWith(COMPANY_A, ACTOR, "markup_rule.set", "MarkupRule", "rule-1", expect.stringContaining("25%"));
    });
  });

  describe("delete()", () => {
    it("scopes the delete to the company", async () => {
      await service.delete(COMPANY_A, "rule-1");
      expect(prisma.markupRule.deleteMany).toHaveBeenCalledWith({ where: { id: "rule-1", companyId: COMPANY_A } });
    });
  });
});
