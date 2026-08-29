import { NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PortalMessagesService } from "./portal-messages.service";
import { PrismaService } from "../common/prisma/prisma.service";

const COMPANY_A = "company-a";
const CLIENT_CONTEXT = { clientId: "client-1", companyId: COMPANY_A };
const ACTOR = { userId: "user-1", name: "PM" };

describe("PortalMessagesService", () => {
  let service: PortalMessagesService;
  let prisma: {
    project: { findFirst: jest.Mock };
    client: { findUniqueOrThrow: jest.Mock };
    portalMessage: { findMany: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      project: { findFirst: jest.fn() },
      client: { findUniqueOrThrow: jest.fn() },
      portalMessage: { findMany: jest.fn(), create: jest.fn() },
    };

    const module = await Test.createTestingModule({
      providers: [PortalMessagesService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(PortalMessagesService);
  });

  describe("client side", () => {
    it("rejects a project that isn't this client's own", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.listForClient(CLIENT_CONTEXT, "project-1")).rejects.toThrow(NotFoundException);
    });

    it("scopes the ownership check to both company and client", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      prisma.portalMessage.findMany.mockResolvedValue([]);

      await service.listForClient(CLIENT_CONTEXT, "project-1");

      expect(prisma.project.findFirst).toHaveBeenCalledWith({
        where: { id: "project-1", companyId: COMPANY_A, clientId: "client-1" },
      });
    });

    it("stamps the message with the client's own name, not a staff author", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      prisma.client.findUniqueOrThrow.mockResolvedValue({ name: "Acme Corp" });
      prisma.portalMessage.create.mockResolvedValue({ id: "msg-1" });

      await service.createForClient(CLIENT_CONTEXT, "project-1", "When can we expect the drywall crew?");

      expect(prisma.portalMessage.create).toHaveBeenCalledWith({
        data: {
          companyId: COMPANY_A,
          projectId: "project-1",
          authorClientId: "client-1",
          authorName: "Acme Corp",
          content: "When can we expect the drywall crew?",
        },
      });
    });
  });

  describe("staff side", () => {
    it("rejects a project that doesn't belong to this company", async () => {
      prisma.project.findFirst.mockResolvedValue(null);

      await expect(service.listForStaff(COMPANY_A, "project-1")).rejects.toThrow(NotFoundException);
    });

    it("stamps the message with the staff author, not a client", async () => {
      prisma.project.findFirst.mockResolvedValue({ id: "project-1" });
      prisma.portalMessage.create.mockResolvedValue({ id: "msg-1" });

      await service.createForStaff(COMPANY_A, ACTOR, "project-1", "Drywall crew starts Monday.");

      expect(prisma.portalMessage.create).toHaveBeenCalledWith({
        data: { companyId: COMPANY_A, projectId: "project-1", authorUserId: "user-1", authorName: "PM", content: "Drywall crew starts Monday." },
      });
    });
  });
});
