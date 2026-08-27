import { FormulaError, assertValidParamName, evaluateFormula } from "./formula";

describe("evaluateFormula", () => {
  it("evaluates basic arithmetic with operator precedence", () => {
    expect(evaluateFormula("2 + 3 * 4", {})).toBe(14);
    expect(evaluateFormula("(2 + 3) * 4", {})).toBe(20);
  });

  it("substitutes named variables", () => {
    expect(evaluateFormula("length * height", { length: 3, height: 2.5 })).toBe(7.5);
  });

  it("supports unary minus and nested parentheses", () => {
    expect(evaluateFormula("-length + (width * 2)", { length: 5, width: 4 })).toBe(3);
  });

  it("supports decimal numbers", () => {
    expect(evaluateFormula("length * 1.5", { length: 4 })).toBe(6);
  });

  it("throws FormulaError on an unknown variable", () => {
    expect(() => evaluateFormula("length * height", { length: 3 })).toThrow(FormulaError);
  });

  it("throws FormulaError on division by zero", () => {
    expect(() => evaluateFormula("length / zero", { length: 3, zero: 0 })).toThrow(FormulaError);
  });

  it("throws FormulaError on a malformed expression", () => {
    expect(() => evaluateFormula("length * (width", { length: 1, width: 1 })).toThrow(FormulaError);
    expect(() => evaluateFormula("length * * width", { length: 1, width: 1 })).toThrow(FormulaError);
  });

  it("throws FormulaError on an unexpected character (rejects any injection attempt)", () => {
    expect(() => evaluateFormula("length; process.exit()", { length: 1 })).toThrow(FormulaError);
  });

  it("throws FormulaError on an empty formula", () => {
    expect(() => evaluateFormula("", {})).toThrow(FormulaError);
  });
});

describe("assertValidParamName", () => {
  it("accepts a valid identifier", () => {
    expect(() => assertValidParamName("wall_height")).not.toThrow();
  });

  it("rejects a name starting with a digit", () => {
    expect(() => assertValidParamName("2height")).toThrow(FormulaError);
  });

  it("rejects a name containing an operator character", () => {
    expect(() => assertValidParamName("a+b")).toThrow(FormulaError);
  });
});
