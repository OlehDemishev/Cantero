import { HttpException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ScimService } from "./scim.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { SessionsService } from "../common/sessions/sessions.service";

const COMPANY_A = "company-a";

describe("ScimService", () => {
  let service: ScimService;
  let prisma: {
    membership: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock; count: jest.Mock };
    user: { findUnique: jest.Mock; create: jest.Mock };
    subscription: { findUnique: jest.Mock };
    invite: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let sessions: { revokeAllInCompany: jest.Mock };

  beforeEach(async () => {
    prisma = {
      membership: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), count: jest.fn().mockResolvedValue(1) },
      user: { findUnique: jest.fn(), create: jest.fn() },
      subscription: { findUnique: jest.fn().mockResolvedValue({ seats: 5 }) },
      invite: { count: jest.fn().mockResolvedValue(0) },
      $transaction: jest.fn((fn) => fn(prisma)),
    };
    sessions = { revokeAllInCompany: jest.fn().mockResolvedValue(2) };

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
      ).rejects.toMatchObject({ status: 409, response: { scimType: "uniqueness", status: "409" } });
    });

    it("refuses to attach an existing account from another company, with a SCIM 409", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "u-other" });
      prisma.membership.findFirst.mockResolvedValue(null);

      const err = await service.createUser(COMPANY_A, { userName: "jane@example.com" }).catch((e: unknown) => e);

      expect(err).toBeInstanceOf(HttpException);
      expect((err as HttpException).getStatus()).toBe(409);
      expect((err as HttpException).getResponse()).toMatchObject({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        scimType: "uniqueness",
        detail: expect.stringMatching(/invite/),
      });
      expect(prisma.membership.create).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("refuses to provision past the paid seats", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.subscription.findUnique.mockResolvedValue({ seats: 3 });
      prisma.membership.count.mockResolvedValue(2);
      prisma.invite.count.mockResolvedValue(1);

      await expect(service.createUser(COMPANY_A, { userName: "new@example.com" })).rejects.toMatchObject({
        status: 403,
        response: { detail: expect.stringMatching(/Seat limit reached \(3\)/) },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.membership.create).not.toHaveBeenCalled();
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

    it("signs the person out of this company only when deactivated via path-based value", async () => {
      prisma.membership.findFirst.mockResolvedValue({
        userId: "u1",
        role: "worker",
        user: { id: "u1", email: "jane@example.com", name: "Jane Doe" },
      });

      await service.patchUser(COMPANY_A, "u1", { Operations: [{ op: "replace", path: "active", value: false }] });

      expect(sessions.revokeAllInCompany).toHaveBeenCalledWith("u1", COMPANY_A);
    });

    it("does not touch sessions for a non-deactivation patch", async () => {
      prisma.membership.findFirst.mockResolvedValue({
        userId: "u1",
        role: "worker",
        user: { id: "u1", email: "jane@example.com", name: "Jane Doe" },
      });

      await service.patchUser(COMPANY_A, "u1", { Operations: [{ op: "replace", path: "name.givenName", value: "Janet" }] });

      expect(sessions.revokeAllInCompany).not.toHaveBeenCalled();
    });
  });
});
