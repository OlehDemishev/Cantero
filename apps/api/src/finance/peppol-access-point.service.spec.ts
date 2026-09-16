import { Test } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PeppolAccessPointService } from "./peppol-access-point.service";

describe("PeppolAccessPointService", () => {
  let service: PeppolAccessPointService;
  let config: { get: jest.Mock };

  beforeEach(async () => {
    config = { get: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [PeppolAccessPointService, { provide: ConfigService, useValue: config }],
    }).compile();
    service = module.get(PeppolAccessPointService);
  });

  it("throws a clear not-configured error when PEPPOL_AP_PROVIDER is unset", async () => {
    config.get.mockReturnValue(undefined);
    await expect(service.sendInvoice("<xml/>", "invoice.xml")).rejects.toThrow(BadRequestException);
    await expect(service.sendInvoice("<xml/>", "invoice.xml")).rejects.toThrow(/isn't configured/);
  });

  it("throws for any provider value, since no real provider is implemented yet", async () => {
    config.get.mockReturnValue("storecove");
    await expect(service.sendInvoice("<xml/>", "invoice.xml")).rejects.toThrow('Unknown PEPPOL_AP_PROVIDER "storecove"');
  });
});
