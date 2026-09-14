import { addMonthsUtc } from "../common/date-utils";

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface AmortizationInput {
  principal: number;
  annualInterestRatePercent: number;
  termMonths: number;
  startDate: Date;
}

export interface AmortizationRow {
  dueDate: Date;
  principalPortion: number;
  interestPortion: number;
}

/**
 * Standard fixed-payment amortization: a level monthly payment split between interest (on the
 * remaining balance) and principal, so the balance reaches exactly zero at the final row. A
 * zero-interest loan degrades to equal principal-only installments (the standard formula divides
 * by zero at rate 0, so it's handled as its own branch). The final row absorbs any rounding
 * remainder so principalPortion sums to exactly `principal` across all rows.
 */
export function calculateAmortizationSchedule({ principal, annualInterestRatePercent, termMonths, startDate }: AmortizationInput): AmortizationRow[] {
  const monthlyRate = annualInterestRatePercent / 100 / 12;
  const monthlyPayment =
    monthlyRate === 0 ? principal / termMonths : (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths));

  const rows: AmortizationRow[] = [];
  let balance = principal;

  for (let month = 1; month <= termMonths; month++) {
    const dueDate = addMonthsUtc(startDate, month);

    const interestPortion = round2(balance * monthlyRate);
    let principalPortion = round2(monthlyPayment - interestPortion);
    if (month === termMonths) principalPortion = round2(balance);

    balance = round2(balance - principalPortion);
    rows.push({ dueDate, principalPortion, interestPortion });
  }

  return rows;
}
