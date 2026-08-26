import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ScimService } from "./scim.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { SessionsService } from "../common/sessions/sessions.service";

const COMPANY_A = "company-a";

describe("ScimService", () => {
  let service: ScimService;
  let prisma: {
    membership: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
    user: { findUnique: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  let sessions: { list: jest.Mock; revoke: jest.Mock };

  beforeEach(async () => {
    prisma = {
      membership: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    sessions = { list: jest.fn(), revoke: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        ScimService,
        { provide: PrismaService, useValue: prisma },
        { provide: SessionsService, useValue: sessions },
      ],
    }).compile();

    service = module.get(ScimService);
  });

  describe("listUsers()", () => {
    it("maps memberships into SCIM User resources", async () => {
      prisma.membership.findMany.mockResolvedValue([
        { userId: "u1", role: "worker", user: { id: "u1", email: "jane@example.com", name: "Jane Doe" } },
      ]);

      const result = await service.listUsers(COMPANY_A);

      expect(result.totalResults).toBe(1);
      expect(result.Resources[0]).toMatchObject({
        id: "u1",
        userName: "jane@example.com",
        name: { givenName: "Jane", familyName: "Doe" },
        active: true,
      });
    });
  });

  describe("createUser()", () => {
    it("rejects provisioning someone already a member of this company", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "u1", email: "jane@example.com" });
      prisma.membership.findFirst.mockResolvedValue({ id: "m1" });

      await expect(
        service.createUser(COMPANY_A, { userName: "jane@example.com", emails: [{ value: "jane@example.com", primary: true }] }),
      ).rejects.toThrow(ConflictException);
    });

    it("creates a passwordless user and a membership for a brand-new email", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: "u2", email: "new@example.com", name: "New Hire" });
      prisma.membership.create.mockResolvedValue({
        userId: "u2",
        role: "worker",
        user: { id: "u2", email: "new@example.com", name: "New Hire" },
      });

      const result = await service.createUser(COMPANY_A, {
        userName: "new@example.com",
        name: { givenName: "New", familyName: "Hire" },
      });

      expect(prisma.membership.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { userId: "u2", companyId: COMPANY_A, role: "worker" } }),
      );
      expect(result.userName).toBe("new@example.com");
    });
  });

  describe("patchUser()", () => {
    it("throws when the user isn't a member of this company", async () => {
      prisma.membership.findFirst.mockResolvedValue(null);

      await expect(service.patchUser(COMPANY_A, "u1", { Operations: [{ op: "replace", path: "active", value: false }] })).rejects.toThrow(
        NotFoundException,
      );
    });

    it("revokes every active session when deactivated via path-based value", async () => {
      prisma.membership.findFirst.mockResolvedValue({
        userId: "u1",
        role: "worker",
        user: { id: "u1", email: "jane@example.com", name: "Jane Doe" },
      });
      sessions.list.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);

      await service.patchUser(COMPANY_A, "u1", { Operations: [{ op: "replace", path: "active", value: false }] });

      expect(sessions.revoke).toHaveBeenCalledWith("u1", "s1");
      expect(sessions.revoke).toHaveBeenCalledWith("u1", "s2");
    });

    it("does not touch sessions for a non-deactivation patch", async () => {
      prisma.membership.findFirst.mockResolvedValue({
        userId: "u1",
        role: "worker",
        user: { id: "u1", email: "jane@example.com", name: "Jane Doe" },
      });

      await service.patchUser(COMPANY_A, "u1", { Operations: [{ op: "replace", path: "name.givenName", value: "Janet" }] });

      expect(sessions.list).not.toHaveBeenCalled();
      expect(sessions.revoke).not.toHaveBeenCalled();
    });
  });
});
