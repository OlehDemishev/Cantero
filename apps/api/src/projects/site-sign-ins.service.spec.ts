import { Test } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { SiteSignInsService } from "./site-sign-ins.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";

describe("SiteSignInsService", () => {
  let service: SiteSignInsService;
  let prisma: {
    project: { findFirst: jest.Mock };
    siteSignIn: { findMany: jest.Mock; create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      siteSignIn: { findMany: jest.fn(), create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [SiteSignInsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(SiteSignInsService);
  });

  describe("signIn()", () => {
    it("404s on a project outside the company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);
      await expect(service.signIn(COMPANY_A, "proj-1", { name: "Bob" })).rejects.toThrow(NotFoundException);
      expect(prisma.siteSignIn.create).not.toHaveBeenCalled();
    });

    it("creates a sign-in row scoped to the project", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "proj-1" });
      prisma.siteSignIn.create.mockResolvedValue({ id: "s-1" });

      await service.signIn(COMPANY_A, "proj-1", { name: "Bob Inspector", visitorCompany: "City Building Dept", purpose: "Framing inspection" });

      expect(prisma.siteSignIn.create).toHaveBeenCalledWith({
        data: {
          companyId: COMPANY_A,
          projectId: "proj-1",
          name: "Bob Inspector",
          visitorCompany: "City Building Dept",
          purpose: "Framing inspection",
        },
      });
    });
  });

  describe("signOut()", () => {
    it("404s on an unknown sign-in", async () => {
      prisma.siteSignIn.findFirst.mockResolvedValue(null);
      await expect(service.signOut(COMPANY_A, "proj-1", "s-1")).rejects.toThrow(NotFoundException);
    });

    it("rejects signing out someone already signed out", async () => {
      prisma.siteSignIn.findFirst.mockResolvedValue({ id: "s-1", signedOutAt: new Date() });
      await expect(service.signOut(COMPANY_A, "proj-1", "s-1")).rejects.toThrow(BadRequestException);
    });

    it("sets signedOutAt for an open sign-in", async () => {
      prisma.siteSignIn.findFirst.mockResolvedValue({ id: "s-1", signedOutAt: null });
      prisma.siteSignIn.update.mockResolvedValue({ id: "s-1", signedOutAt: new Date() });

      await service.signOut(COMPANY_A, "proj-1", "s-1");

      expect(prisma.siteSignIn.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: "s-1" }, data: expect.objectContaining({ signedOutAt: expect.any(Date) }) }),
      );
    });
  });
});
