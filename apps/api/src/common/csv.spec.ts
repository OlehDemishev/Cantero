import { csvEscape, toCsv, parseCsvRecords, parseCsvRows } from "./csv";

describe("parseCsvRows", () => {
  it("parses plain comma-separated rows", () => {
    expect(parseCsvRows("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles a quoted field containing a comma", () => {
    expect(parseCsvRows('name,note\n"Acme, Inc.",ok')).toEqual([
      ["name", "note"],
      ["Acme, Inc.", "ok"],
    ]);
  });

  it("unescapes a doubled quote inside a quoted field", () => {
    expect(parseCsvRows('name\n"Say ""hi"" now"')).toEqual([["name"], ['Say "hi" now']]);
  });

  it("handles a quoted field containing a newline", () => {
    expect(parseCsvRows('name\n"line one\nline two",tail')).toEqual([["name"], ["line one\nline two", "tail"]]);
  });

  it("treats CRLF as a single row terminator", () => {
    expect(parseCsvRows("a,b\r\n1,2\r\n3,4")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("skips fully blank lines", () => {
    expect(parseCsvRows("a,b\n1,2\n\n3,4\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseCsvRows("")).toEqual([]);
  });
});

describe("parseCsvRecords", () => {
  it("keys each row by trimmed, lowercased header", () => {
    const records = parseCsvRecords(" Name , Email \nAcme,acme@example.com");
    expect(records).toEqual([{ name: "Acme", email: "acme@example.com" }]);
  });

  it("trims cell values", () => {
    const records = parseCsvRecords("name,email\n  Acme  ,  acme@example.com  ");
    expect(records[0]).toEqual({ name: "Acme", email: "acme@example.com" });
  });

  it("fills missing trailing columns with an empty string", () => {
    const records = parseCsvRecords("name,email,phone\nAcme");
    expect(records[0]).toEqual({ name: "Acme", email: "", phone: "" });
  });

  it("returns an empty array for a header-only file", () => {
    expect(parseCsvRecords("name,email\n")).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseCsvRecords("")).toEqual([]);
  });
});

describe("csvEscape", () => {
  it.each([
    ["=1+1", "'=1+1"],
    ["+cmd|' /C calc'!A0", "'+cmd|' /C calc'!A0"],
    ["-2+3", "'-2+3"],
    ["@SUM(A1:A2)", "'@SUM(A1:A2)"],
    ["\t=1", "'\t=1"],
  ])("defuses a cell that a spreadsheet would run as a formula (%j)", (raw, expected) => {
    expect(csvEscape(raw)).toBe(expected);
  });

  it("defuses a leading CR and still quotes the cell", () => {
    expect(csvEscape("\r=1")).toBe(`"'\r=1"`);
  });

  it("quotes after defusing when the cell holds a comma or quote", () => {
    expect(csvEscape('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`);
  });

  it.each(["-12.50", "+3", "-7", "42"])("leaves the plain number %s alone", (raw) => {
    expect(csvEscape(raw)).toBe(raw);
  });

  it("leaves ordinary text alone", () => {
    expect(csvEscape("Jane Doe")).toBe("Jane Doe");
    expect(csvEscape("a=b")).toBe("a=b");
  });

  it("applies to every cell toCsv writes", () => {
    expect(toCsv(["name"], [["=evil()"]])).toBe("name\r\n'=evil()");
  });
});
