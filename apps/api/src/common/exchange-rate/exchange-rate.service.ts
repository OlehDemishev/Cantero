import { Injectable, Logger } from "@nestjs/common";
import type { Currency } from "@cantero/shared";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Static, periodically-reseeded conversion rates (see prisma/seed.ts) rather than a live forex
 * feed — no API key is available for one. convert() degrades gracefully: a missing rate returns
 * the amount unconverted (logged as a warning) rather than throwing, since a rollup report
 * showing a slightly-off number beats one that crashes entirely.
 */
@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(private readonly prisma: PrismaService) {}

  async convert(amount: number, from: Currency, to: Currency): Promise<number> {
    if (from === to || amount === 0) return amount;

    const rate = await this.getRate(from, to);
    if (rate === null) {
      this.logger.warn(`No exchange rate for ${from}->${to}, returning unconverted amount`);
      return amount;
    }
    return amount * rate;
  }

  /** The raw current rate for one pair — null when none is on file. 1 for a same-currency pair. */
  async getRate(from: Currency, to: Currency): Promise<number | null> {
    if (from === to) return 1;
    const rate = await this.prisma.exchangeRate.findUnique({
      where: { fromCurrency_toCurrency: { fromCurrency: from, toCurrency: to } },
    });
    return rate ? Number(rate.rate) : null;
  }

  list() {
    return this.prisma.exchangeRate.findMany({ orderBy: [{ fromCurrency: "asc" }, { toCurrency: "asc" }] });
  }
}
