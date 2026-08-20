import { BadRequestException, ConflictException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InvitesService } from "./invites.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";

const COMPANY_A = "company-a";

describe("InvitesService", () => {
  let service: InvitesService;
  let mail: { send: jest.Mock };
  let prisma: {
    subscription: { findUnique: jest.Mock };
    membership: { count: jest.Mock; findFirst: jest.Mock };
    invite: { count: jest.Mock; create: jest.Mock; findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      subscription: { findUnique: jest.fn() },
      membership: { count: jest.fn(), findFirst: jest.fn() },
      invite: { count: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
    };
    mail = { send: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        InvitesService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: { sign: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: MailService, useValue: mail },
      ],
    }).compile();

    service = module.get(InvitesService);
  });

  describe("create()", () => {
    it("rejects once members + pending invites reach the seat count", async () => {
      prisma.subscription.findUnique.mockResolvedValue({ seats: 3 });
      prisma.membership.count.mockResolvedValue(2);
      prisma.invite.count.mockResolvedValue(1);

      await expect(service.create(COMPANY_A, { email: "new@example.com", role: "worker" })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.invite.create).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    });

    it("rejects inviting an email that already belongs to a member of this company", async () => {
      prisma.subscription.findUnique.mockResolvedValue({ seats: 5 });
      prisma.membership.count.mockResolvedValue(1);
      prisma.invite.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue({ id: "user-1", email: "existing@example.com" });
      prisma.membership.findFirst.mockResolvedValue({ id: "membership-1", userId: "user-1", companyId: COMPANY_A });

      await expect(service.create(COMPANY_A, { email: "existing@example.com", role: "worker" })).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.invite.create).not.toHaveBeenCalled();
    });

    it("emails the invited address with a link containing the generated invite token when a seat is available", async () => {
      prisma.subscription.findUnique.mockResolvedValue({ seats: 5 });
      prisma.membership.count.mockResolvedValue(1);
      prisma.invite.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.invite.create.mockImplementation(({ data }) => Promise.resolve({ id: "invite-1", ...data }));
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, name: "Acme Co" });

      await service.create(COMPANY_A, { email: "new@example.com", role: "worker" });

      const generatedToken = prisma.invite.create.mock.calls[0][0].data.token;
      expect(generatedToken).toMatch(/^[0-9a-f]{48}$/);
      expect(mail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "new@example.com",
          text: expect.stringContaining(`/accept-invite/${generatedToken}`),
        }),
      );
    });
  });

  describe("accept()", () => {
    const validInvite = {
      id: "invite-1",
      companyId: COMPANY_A,
      email: "invitee@example.com",
      role: "worker",
      token: "abc123",
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
    };

    it("rejects once the company's seats are already full", async () => {
      prisma.invite.findUnique.mockResolvedValue(validInvite);
      prisma.subscription.findUnique.mockResolvedValue({ seats: 1 });
      prisma.membership.count.mockResolvedValue(1);
      prisma.invite.count.mockResolvedValue(0);

      await expect(
        service.accept({ token: "abc123", name: "Invitee", password: "password123" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects when the invited email already has a membership in this company", async () => {
      prisma.invite.findUnique.mockResolvedValue(validInvite);
      prisma.subscription.findUnique.mockResolvedValue({ seats: 5 });
      prisma.membership.count.mockResolvedValue(1);
      prisma.invite.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue({ id: "user-1", email: "invitee@example.com" });
      prisma.membership.findFirst.mockResolvedValue({ id: "membership-1", userId: "user-1", companyId: COMPANY_A });

      await expect(
        service.accept({ token: "abc123", name: "Invitee", password: "password123" }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
