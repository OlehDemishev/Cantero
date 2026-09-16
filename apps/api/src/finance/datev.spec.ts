import {
  formatDatevAmount,
  formatDatevDate,
  buildDatevHeader,
  buildDatevPostingRow,
  buildDatevBuchungsstapelCsv,
  resolveDatevFiscalYearStart,
  DATEV_COLUMN_HEADER,
} from "./datev";

describe("formatDatevAmount", () => {
  it("uses a comma as the decimal separator", () => {
    expect(formatDatevAmount(1234.5)).toBe("1234,50");
  });

  it("rounds to 2 decimals", () => {
    expect(formatDatevAmount(45.999)).toBe("46,00");
  });

  it("always returns a positive amount, even for a negative input", () => {
    expect(formatDatevAmount(-100)).toBe("100,00");
  });

  it("formats zero correctly", () => {
    expect(formatDatevAmount(0)).toBe("0,00");
  });
});

describe("formatDatevDate", () => {
  it("formats as DDMMYYYY", () => {
    expect(formatDatevDate(new Date("2026-08-31T00:00:00.000Z"))).toBe("31082026");
  });

  it("pads single-digit day and month", () => {
    expect(formatDatevDate(new Date("2026-01-05T00:00:00.000Z"))).toBe("05012026");
  });
});

describe("buildDatevHeader", () => {
  function baseInput() {
    return {
      companyName: "Cantero Bau GmbH",
      createdAt: new Date("2026-09-16T10:30:05.000Z"),
      consultantNumber: "12345",
      clientNumber: "1001",
      fiscalYearStart: new Date("2026-01-01T00:00:00.000Z"),
      sachkontenlaenge: 4,
      batchFrom: new Date("2026-08-01T00:00:00.000Z"),
      batchTo: new Date("2026-08-31T00:00:00.000Z"),
      label: "Verkauf August 2026",
    };
  }

  it("starts with the EXTF marker, version, and category", () => {
    const header = buildDatevHeader(baseInput());
    const fields = header.split(";");
    expect(fields[0]).toBe('"EXTF"');
    expect(fields[1]).toBe("510");
    expect(fields[2]).toBe("21");
    expect(fields[3]).toBe('"Buchungsstapel"');
  });

  it("includes the consultant/client numbers and fiscal-year-start date", () => {
    const header = buildDatevHeader(baseInput());
    expect(header).toContain(";12345;1001;20260101;4;");
  });

  it("includes the batch date range and label", () => {
    const header = buildDatevHeader(baseInput());
    expect(header).toContain("20260801;20260831");
    expect(header).toContain('"Verkauf August 2026"');
  });

  it("sets Buchungstyp to 2 (Debitoren/Kreditoren-style)", () => {
    const header = buildDatevHeader(baseInput());
    const fields = header.split(";");
    // Buchungstyp is the 19th field (index 18).
    expect(fields[18]).toBe("2");
  });

  it("has exactly 22 semicolon-delimited fields", () => {
    const header = buildDatevHeader(baseInput());
    expect(header.split(";")).toHaveLength(22);
  });
});

describe("buildDatevPostingRow", () => {
  it("formats a debit posting with the given accounts and amount", () => {
    const row = buildDatevPostingRow({
      amount: 5414.5,
      konto: "10001",
      gegenkonto: "8400",
      belegdatum: new Date("2026-08-31T00:00:00.000Z"),
      belegfeld1: "INV-2026-042",
      buchungstext: "Bauherr Schmidt",
    });
    const fields = row.split(";");
    expect(fields[0]).toBe("5414,50");
    expect(fields[1]).toBe("S");
    expect(fields[6]).toBe("10001");
    expect(fields[7]).toBe("8400");
    expect(fields[9]).toBe("31082026");
    expect(fields[10]).toBe('"INV-2026-042"');
    expect(fields[13]).toBe('"Bauherr Schmidt"');
  });

  it("has exactly 14 semicolon-delimited fields, matching the column header", () => {
    const row = buildDatevPostingRow({
      amount: 100,
      konto: "10001",
      gegenkonto: "8400",
      belegdatum: new Date("2026-08-31"),
      belegfeld1: "INV-1",
      buchungstext: "Test",
    });
    expect(row.split(";")).toHaveLength(14);
    expect(DATEV_COLUMN_HEADER.split(";")).toHaveLength(14);
  });

  it("escapes embedded quotes in text fields", () => {
    const row = buildDatevPostingRow({
      amount: 100,
      konto: "10001",
      gegenkonto: "8400",
      belegdatum: new Date("2026-08-31"),
      belegfeld1: "INV-1",
      buchungstext: 'Client "The Big One" GmbH',
    });
    expect(row).toContain('"Client ""The Big One"" GmbH"');
  });
});

describe("buildDatevBuchungsstapelCsv", () => {
  it("joins the header row, column-name row, and data rows with CRLF", () => {
    const header = "header-row";
    const rows = ["row-1", "row-2"];
    const csv = buildDatevBuchungsstapelCsv(header, rows);
    expect(csv.split("\r\n")).toEqual(["header-row", DATEV_COLUMN_HEADER, "row-1", "row-2"]);
  });

  it("produces just the two header rows when there are no postings", () => {
    const csv = buildDatevBuchungsstapelCsv("header-row", []);
    expect(csv.split("\r\n")).toHaveLength(2);
  });
});

describe("resolveDatevFiscalYearStart", () => {
  it("resolves a calendar-year fiscal year (Jan 1) for a date later in that year", () => {
    const start = resolveDatevFiscalYearStart(1, 1, new Date("2026-08-31T00:00:00.000Z"));
    expect(start.toISOString().slice(0, 10)).toBe("2026-01-01");
  });

  it("resolves a non-calendar fiscal year (Apr 1) for a date before this year's start, to last year's start", () => {
    const start = resolveDatevFiscalYearStart(4, 1, new Date("2026-02-15T00:00:00.000Z"));
    expect(start.toISOString().slice(0, 10)).toBe("2025-04-01");
  });

  it("resolves a non-calendar fiscal year (Apr 1) for a date after this year's start, to this year's start", () => {
    const start = resolveDatevFiscalYearStart(4, 1, new Date("2026-08-31T00:00:00.000Z"));
    expect(start.toISOString().slice(0, 10)).toBe("2026-04-01");
  });
});
