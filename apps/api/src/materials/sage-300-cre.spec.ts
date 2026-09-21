import { assertSageBillsExportable, buildSage300CreApInvoices, type SageApBill } from "./sage-300-cre";

const bill: SageApBill = {
  billNumber: "LIEF-4471",
  billDate: new Date("2026-09-10"),
  dueDate: new Date("2026-10-10"),
  scheduledPaymentDate: null,
  notes: null,
  supplierName: "Beton Schmidt GmbH",
  sageVendorId: "BETON01",
  lines: [
    { description: "Transportbeton C25/30", quantity: 40, unitPrice: 95.5 },
    { description: 'Pump, "big"', quantity: 1, unitPrice: 250 },
  ],
};

describe("buildSage300CreApInvoices", () => {
  const out = buildSage300CreApInvoices([bill], { expenseAccount: "50-1000", apAccount: "20-1000" }).split("\r\n");

  it("emits one APIF header then one APDF per line, CRLF-terminated", () => {
    expect(out.map((l) => l.split(",")[0])).toEqual(["APIF", "APDF", "APDF", ""]);
  });

  it("puts each value in its documented slot (header has 21 fields, distribution 47)", () => {
    const header = out[0].split(",");
    expect(header).toHaveLength(21);
    expect(header[1]).toBe("BETON01"); // Vendor
    expect(header[2]).toBe("LIEF-4471"); // Invoice
    expect(header[4]).toBe("4070.00"); // Amount = 3820 + 250
    expect(header[8]).toBe("09/10/2026"); // Invoice Date
    expect(header[11]).toBe("10/10/2026"); // Payment Date falls back to dueDate

    const dist = out[1].split(",");
    expect(dist).toHaveLength(47);
    expect(dist[11]).toBe("50-1000"); // Expense account
    expect(dist[12]).toBe("20-1000"); // AP account
    expect(dist.slice(15, 18)).toEqual(["40.0000", "95.5000", "3820.00"]); // Units, Unit Cost, Amount
    expect(dist[31]).toBe("Transportbeton C25/30"); // Description
  });

  it("quotes fields containing commas or quotes", () => {
    expect(out[2]).toContain('"Pump, ""big"""');
  });

  it("makes the header amount equal the sum of the rounded distributions", () => {
    const b = { ...bill, lines: [{ description: "x", quantity: 3, unitPrice: 0.335 }, { description: "y", quantity: 3, unitPrice: 0.335 }] };
    const rows = buildSage300CreApInvoices([b]).split("\r\n");
    const dists = rows.filter((r) => r.startsWith("APDF")).map((r) => Number(r.split(",")[17]));
    expect(Number(rows[0].split(",")[4])).toBeCloseTo(dists.reduce((a, c) => a + c, 0), 2);
  });

  it("defuses a leading formula character", () => {
    const rows = buildSage300CreApInvoices([{ ...bill, lines: [{ description: "=CMD()", quantity: 1, unitPrice: 1 }] }]).split("\r\n");
    expect(rows[1].split(",")[31]).toBe(" =CMD()");
  });

  it("leaves accounts blank when none are given, for Sage to derive from vendor defaults", () => {
    const dist = buildSage300CreApInvoices([bill]).split("\r\n")[1].split(",");
    expect(dist[11]).toBe("");
    expect(dist[12]).toBe("");
  });
});

describe("assertSageBillsExportable", () => {
  it("passes a complete bill", () => {
    expect(() => assertSageBillsExportable([bill])).not.toThrow();
  });

  it("lists every bill that lacks a vendor id or exceeds Sage's length limits", () => {
    expect(() =>
      assertSageBillsExportable([
        { ...bill, billNumber: "A", sageVendorId: null },
        { ...bill, billNumber: "B", sageVendorId: "WAYTOOLONGID" },
        { ...bill, billNumber: "C-IS-WAY-TOO-LONG-FOR-SAGE" },
      ]),
    ).toThrow(/A \(Beton Schmidt GmbH\).*\n.*B: Sage Vendor ID.*\n.*C-IS-WAY/);
  });
});
