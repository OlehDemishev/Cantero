import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, UnauthorizedException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { InvitesService } from "./invites.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { MailService } from "../common/mail/mail.service";
import { SessionsService } from "../common/sessions/sessions.service";
import { TwoFactorService } from "../auth/two-factor.service";

const COMPANY_A = "company-a";

describe("InvitesService", () => {
  let service: InvitesService;
  let mail: { send: jest.Mock };
  let jwt: { sign: jest.Mock; verifyAsync: jest.Mock };
  let twoFactor: { verifyCodeForUser: jest.Mock };
  let prisma: {
    subscription: { findUnique: jest.Mock };
    membership: { count: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
    invite: { count: jest.Mock; create: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
    user: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; create: jest.Mock };
    company: { findUniqueOrThrow: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      subscription: { findUnique: jest.fn() },
      membership: { count: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
      invite: { count: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), create: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
      $transaction: jest.fn(),
    };
    // Every finalizeAcceptance() transaction runs against the same mocked tables (tx === prisma).
    prisma.$transaction.mockImplementation(async (cb: (tx: typeof prisma) => unknown) => cb(prisma));
    mail = { send: jest.fn() };
    jwt = { sign: jest.fn().mockReturnValue("signed-jwt"), verifyAsync: jest.fn() };
    twoFactor = { verifyCodeForUser: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        InvitesService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: MailService, useValue: mail },
        { provide: SessionsService, useValue: { create: jest.fn().mockResolvedValue("session-1") } },
        { provide: TwoFactorService, useValue: twoFactor },
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

    it("emails the invited address a link with the raw token, storing only its hash", async () => {
      prisma.subscription.findUnique.mockResolvedValue({ seats: 5 });
      prisma.membership.count.mockResolvedValue(1);
      prisma.invite.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.invite.create.mockImplementation(({ data }) => Promise.resolve({ id: "invite-1", ...data }));
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: COMPANY_A, name: "Acme Co" });

      await service.create(COMPANY_A, { email: "new@example.com", role: "worker" });

      const storedToken = prisma.invite.create.mock.calls[0][0].data.token;
      const emailedToken = /\/accept-invite\/([0-9a-f]+)/.exec(mail.send.mock.calls[0][0].text)![1];
      expect(emailedToken).toMatch(/^[0-9a-f]{48}$/);
      expect(storedToken).toBe(createHash("sha256").update(emailedToken).digest("hex"));
      expect(mail.send).toHaveBeenCalledWith(expect.objectContaining({ to: "new@example.com" }));
      // The token never goes back to the inviter either.
      expect(prisma.invite.create.mock.calls[0][0].select).not.toHaveProperty("token");
    });

    it("looks an invite up by the hash of the token in the link", async () => {
      prisma.invite.findUnique.mockResolvedValue(null);

      await expect(service.getByToken("a".repeat(48))).rejects.toThrow(NotFoundException);

      expect(prisma.invite.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { token: createHash("sha256").update("a".repeat(48)).digest("hex") } }),
      );
    });

    it("shows the public accept page only the company's name and language, never the company row", async () => {
      prisma.invite.findUnique.mockResolvedValue({
        email: "new@example.com",
        role: "worker",
        expiresAt: new Date(Date.now() + 86_400_000),
        acceptedAt: null,
        company: { name: "Acme Co", locale: "de", slackWebhookUrl: "https://hooks.slack.com/secret", calendarFeedToken: "feed" },
      });

      const result = await service.getPublicByToken("a".repeat(48));

      expect(result.company).toEqual({ name: "Acme Co", locale: "de" });
      expect(JSON.stringify(result)).not.toContain("hooks.slack.com");
    });

    it("leaves inviting an admin to the owner", async () => {
      prisma.subscription.findUnique.mockResolvedValue({ seats: 5 });
      prisma.membership.count.mockResolvedValue(1);
      prisma.invite.count.mockResolvedValue(0);

      await expect(service.create(COMPANY_A, { email: "new@example.com", role: "admin" }, "admin")).rejects.toThrow(ForbiddenException);
      expect(prisma.invite.create).not.toHaveBeenCalled();
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
        service.accept({ token: "abc123", name: "Invitee", password: "password123" }, {}),
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
        service.accept({ token: "abc123", name: "Invitee", password: "password123" }, {}),
      ).rejects.toThrow(ConflictException);
    });

    it("does not count the invite being accepted against its own seat limit", async () => {
      // A company with 1 seat, 1 existing member, and this one pending invite is fully reserved
      // in the ordinary sense — but accepting THIS invite converts a reservation into a member,
      // not a net-new occupant, so it must still succeed.
      prisma.invite.findUnique.mockResolvedValue(validInvite);
      prisma.subscription.findUnique.mockResolvedValue({ seats: 2 });
      prisma.membership.count.mockResolvedValue(1);
      prisma.invite.count.mockImplementation(({ where }: { where: { id?: { not: string } } }) =>
        // Simulates a real query: excluding the invite's own id drops the pending count to 0.
        Promise.resolve(where.id?.not === validInvite.id ? 0 : 1),
      );
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.company.findUniqueOrThrow.mockResolvedValue({ passwordMinLength: 8, passwordRequireSymbol: false });
      prisma.user.create.mockResolvedValue({ id: "new-user", email: validInvite.email, name: "Invitee" });
      prisma.membership.findFirst.mockResolvedValue(null);
      prisma.membership.create.mockResolvedValue({ role: "worker" });

      const result = await service.accept({ token: "abc123", name: "Invitee", password: "password123" }, {});

      expect("accessToken" in result).toBe(true);
      expect(prisma.invite.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { not: "invite-1" } }) }));
    });

    it("re-checks the seat count inside the transaction, not just the fast-path outer check — closes the race where another accept fills the last seat in between", async () => {
      // The outer, pre-transaction check sees 0 members (passes against 1 seat). By the time the
      // transaction itself runs, a concurrent accept has landed and membership.count would now
      // return 1 — the authoritative in-transaction re-check must catch that, not just trust the
      // outer check's now-stale snapshot.
      prisma.invite.findUnique.mockResolvedValue(validInvite);
      prisma.subscription.findUnique.mockResolvedValue({ seats: 1 });
      prisma.membership.count.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
      prisma.invite.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.company.findUniqueOrThrow.mockResolvedValue({ passwordMinLength: 8, passwordRequireSymbol: false });

      await expect(
        service.accept({ token: "abc123", name: "Invitee", password: "password123" }, {}),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.membership.create).not.toHaveBeenCalled();
    });

    it("rejects an existing account's invite acceptance with the wrong password", async () => {
      const passwordHash = await bcrypt.hash("correct-password", 10);
      prisma.invite.findUnique.mockResolvedValue(validInvite);
      prisma.subscription.findUnique.mockResolvedValue({ seats: 5 });
      prisma.membership.count.mockResolvedValue(1);
      prisma.invite.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue({ id: "user-1", email: validInvite.email, passwordHash, totpEnabledAt: null });
      prisma.membership.findFirst.mockResolvedValue(null);

      await expect(
        service.accept({ token: "abc123", name: "Invitee", password: "wrong-password" }, {}),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.membership.create).not.toHaveBeenCalled();
    });

    it("returns a 2FA challenge (and creates no membership yet) for an existing account with 2FA active", async () => {
      const passwordHash = await bcrypt.hash("correct-password", 10);
      prisma.invite.findUnique.mockResolvedValue(validInvite);
      prisma.subscription.findUnique.mockResolvedValue({ seats: 5 });
      prisma.membership.count.mockResolvedValue(1);
      prisma.invite.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: validInvite.email,
        passwordHash,
        totpEnabledAt: new Date(),
      });
      prisma.membership.findFirst.mockResolvedValue(null);

      const result = await service.accept({ token: "abc123", name: "Invitee", password: "correct-password" }, {});

      expect(result).toEqual({ requires2fa: true, challengeToken: "signed-jwt" });
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1", inviteToken: "abc123", kind: "invite_2fa_challenge" }),
        expect.objectContaining({ expiresIn: "10m" }),
      );
      expect(prisma.membership.create).not.toHaveBeenCalled();
    });

    it("signs the existing account straight in when the password is correct and 2FA is off", async () => {
      const passwordHash = await bcrypt.hash("correct-password", 10);
      prisma.invite.findUnique.mockResolvedValue(validInvite);
      prisma.subscription.findUnique.mockResolvedValue({ seats: 5 });
      prisma.membership.count.mockResolvedValue(1);
      prisma.invite.count.mockResolvedValue(0);
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: validInvite.email,
        name: "Existing Person",
        passwordHash,
        totpEnabledAt: null,
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1", email: validInvite.email, name: "Existing Person" });
      prisma.membership.findFirst.mockResolvedValue(null);
      prisma.membership.create.mockResolvedValue({ role: "worker" });

      const result = await service.accept({ token: "abc123", name: "Invitee", password: "correct-password" }, {});

      expect(result).toEqual({ accessToken: "signed-jwt", companyId: COMPANY_A });
      expect(prisma.membership.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ userId: "user-1", companyId: COMPANY_A, role: "worker" }) }),
      );
      expect(prisma.invite.update).toHaveBeenCalledWith({ where: { id: "invite-1" }, data: { acceptedAt: expect.any(Date) } });
    });
  });

  describe("completeAcceptAfterTwoFactor()", () => {
    const validInvite = {
      id: "invite-1",
      companyId: COMPANY_A,
      email: "invitee@example.com",
      role: "worker",
      token: "abc123",
      acceptedAt: null,
      expiresAt: new Date(Date.now() + 86_400_000),
    };

    it("rejects an expired or malformed challenge token", async () => {
      jwt.verifyAsync.mockRejectedValue(new Error("bad token"));

      await expect(service.completeAcceptAfterTwoFactor({ challengeToken: "garbage", code: "123456" }, {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("rejects a challenge token of the wrong kind", async () => {
      jwt.verifyAsync.mockResolvedValue({ userId: "user-1", inviteToken: "abc123", kind: "2fa_challenge" });

      await expect(service.completeAcceptAfterTwoFactor({ challengeToken: "token", code: "123456" }, {})).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("rejects an incorrect code without creating a membership", async () => {
      jwt.verifyAsync.mockResolvedValue({ userId: "user-1", inviteToken: "abc123", kind: "invite_2fa_challenge" });
      twoFactor.verifyCodeForUser.mockResolvedValue(false);

      await expect(service.completeAcceptAfterTwoFactor({ challengeToken: "token", code: "000000" }, {})).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.membership.create).not.toHaveBeenCalled();
    });

    it("completes the membership once the code is correct", async () => {
      jwt.verifyAsync.mockResolvedValue({ userId: "user-1", inviteToken: "abc123", kind: "invite_2fa_challenge" });
      twoFactor.verifyCodeForUser.mockResolvedValue(true);
      prisma.invite.findUnique.mockResolvedValue(validInvite);
      prisma.subscription.findUnique.mockResolvedValue({ seats: 5 });
      prisma.membership.count.mockResolvedValue(1);
      prisma.invite.count.mockResolvedValue(0);
      prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1", email: validInvite.email, name: "Existing Person" });
      prisma.membership.findFirst.mockResolvedValue(null);
      prisma.membership.create.mockResolvedValue({ role: "worker" });

      const result = await service.completeAcceptAfterTwoFactor({ challengeToken: "token", code: "123456" }, {});

      expect(result).toEqual({ accessToken: "signed-jwt", companyId: COMPANY_A });
      expect(prisma.membership.create).toHaveBeenCalled();
    });
  });
});
