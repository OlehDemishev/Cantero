import { Test } from "@nestjs/testing";
import { ExchangeRateService } from "./exchange-rate.service";
import { PrismaService } from "../prisma/prisma.service";

describe("ExchangeRateService", () => {
  let service: ExchangeRateService;
  let prisma: { exchangeRate: { findUnique: jest.Mock } };

  beforeEach(async () => {
    prisma = { exchangeRate: { findUnique: jest.fn() } };

    const module = await Test.createTestingModule({
      providers: [ExchangeRateService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ExchangeRateService);
  });

  it("returns the amount unchanged when converting to the same currency", async () => {
    const result = await service.convert(100, "EUR", "EUR");
    expect(result).toBe(100);
    expect(prisma.exchangeRate.findUnique).not.toHaveBeenCalled();
  });

  it("returns 0 unchanged without a lookup", async () => {
    const result = await service.convert(0, "EUR", "USD");
    expect(result).toBe(0);
    expect(prisma.exchangeRate.findUnique).not.toHaveBeenCalled();
  });

  it("multiplies by the stored rate for a known pair", async () => {
    prisma.exchangeRate.findUnique.mockResolvedValue({ rate: "1.08" });

    const result = await service.convert(100, "EUR", "USD");

    expect(result).toBe(108);
    expect(prisma.exchangeRate.findUnique).toHaveBeenCalledWith({
      where: { fromCurrency_toCurrency: { fromCurrency: "EUR", toCurrency: "USD" } },
    });
  });

  it("degrades to the unconverted amount when no rate is on file, instead of throwing", async () => {
    prisma.exchangeRate.findUnique.mockResolvedValue(null);

    const result = await service.convert(100, "EUR", "GBP");

    expect(result).toBe(100);
  });

  describe("getRate()", () => {
    it("returns 1 for the same currency without a lookup", async () => {
      const result = await service.getRate("EUR", "EUR");
      expect(result).toBe(1);
      expect(prisma.exchangeRate.findUnique).not.toHaveBeenCalled();
    });

    it("returns the raw stored rate for a known pair", async () => {
      prisma.exchangeRate.findUnique.mockResolvedValue({ rate: "1.08" });
      const result = await service.getRate("EUR", "USD");
      expect(result).toBe(1.08);
    });

    it("returns null rather than a guessed rate when none is on file", async () => {
      prisma.exchangeRate.findUnique.mockResolvedValue(null);
      const result = await service.getRate("EUR", "GBP");
      expect(result).toBeNull();
    });
  });
});
