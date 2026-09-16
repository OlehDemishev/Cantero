import { buildGaebDa83Xml, parseGaebDa84Xml, GaebParseError, type BuildGaebDa83XmlInput } from "./gaeb";

function baseInput(overrides: Partial<BuildGaebDa83XmlInput> = {}): BuildGaebDa83XmlInput {
  return {
    projectName: "Riverside Renovation",
    title: "Electrical rough-in",
    description: "Rough-in wiring for floors 1-3",
    submissionDeadline: new Date("2026-10-15T00:00:00.000Z"),
    owner: {
      name: "Cantero Bau GmbH",
      street: "Musterstraße 12",
      city: "Berlin",
      postalCode: "10115",
      countryCode: "DE",
    },
    lines: [
      { positionNo: "01.010", description: "Conduit, 20mm", quantity: 150, unit: "m" },
      { positionNo: "01.020", description: "Junction box", quantity: 12, unit: "Stk" },
    ],
    ...overrides,
  };
}

describe("buildGaebDa83Xml", () => {
  it("includes the project/title header and owner party", () => {
    const xml = buildGaebDa83Xml(baseInput());
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<NamePrj>Riverside Renovation</NamePrj>");
    expect(xml).toContain("<LblPrj>Electrical rough-in</LblPrj>");
    expect(xml).toContain("<Name1>Cantero Bau GmbH</Name1>");
    expect(xml).toContain("<Country>DE</Country>");
    expect(xml).toContain("<SubmDlDt>2026-10-15</SubmDlDt>");
    expect(xml).toContain("<Comment>Rough-in wiring for floors 1-3</Comment>");
  });

  it("emits one unpriced Item per line, keyed by position number", () => {
    const xml = buildGaebDa83Xml(baseInput());
    expect(xml).toContain('<Item RNoPart="01.010">');
    expect(xml).toContain("<Qty>150.0000</Qty>");
    expect(xml).toContain("<QU>m</QU>");
    expect(xml).toContain('<Item RNoPart="01.020">');
    expect(xml).toContain("<Qty>12.0000</Qty>");
    expect(xml).toContain("<UP></UP>");
    expect(xml).toContain("<IT></IT>");
  });

  it("escapes XML-significant characters in text fields", () => {
    const xml = buildGaebDa83Xml(baseInput({ lines: [{ positionNo: "01.010", description: 'Cable & "Duct" <Type A>', quantity: 1, unit: "Stk" }] }));
    expect(xml).toContain("Cable &amp; &quot;Duct&quot; &lt;Type A&gt;");
  });

  it("omits the deadline/comment elements when not provided", () => {
    const xml = buildGaebDa83Xml(baseInput({ description: null, submissionDeadline: null }));
    expect(xml).not.toContain("<Comment>");
    expect(xml).not.toContain("<SubmDlDt>");
  });
});

describe("parseGaebDa84Xml", () => {
  it("round-trips a DA83 export with prices manually filled in, as a subcontractor's GAEB software would", () => {
    const da83 = buildGaebDa83Xml(baseInput());
    const priced = da83.replace('<Qty>150.0000</Qty>\n          <QU>m</QU>\n          <UP></UP>', "<Qty>150.0000</Qty>\n          <QU>m</QU>\n          <UP>2.50</UP>");

    const items = parseGaebDa84Xml(priced);

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({ positionNo: "01.010", description: "Conduit, 20mm", quantity: 150, unitPrice: 2.5 });
    expect(items[1]).toEqual({ positionNo: "01.020", description: "Junction box", quantity: 12, unitPrice: null });
  });

  it("rejects malformed XML", () => {
    expect(() => parseGaebDa84Xml("<GAEB><Award>")).toThrow(GaebParseError);
  });

  it("rejects XML that isn't a recognizable GAEB document", () => {
    expect(() => parseGaebDa84Xml("<root><foo>bar</foo></root>")).toThrow(GaebParseError);
  });

  it("rejects an Item with no position number", () => {
    const xml = `<GAEB><Award><BoQ><BoQBody><Itemlist><Item><Qty>1</Qty></Item></Itemlist></BoQBody></BoQ></Award></GAEB>`;
    expect(() => parseGaebDa84Xml(xml)).toThrow(GaebParseError);
  });
});
