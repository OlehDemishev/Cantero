import { classifyCylinderBreak } from "./classify-cylinder-break";

describe("classifyCylinderBreak", () => {
  it("returns null when there is no specified strength to compare against", () => {
    expect(classifyCylinderBreak(3500, null)).toBeNull();
  });

  it("passes when break strength meets the specified strength exactly", () => {
    expect(classifyCylinderBreak(4000, 4000)).toBe("pass");
  });

  it("passes when break strength exceeds the specified strength", () => {
    expect(classifyCylinderBreak(4200, 4000)).toBe("pass");
  });

  it("fails when break strength is below the specified strength", () => {
    expect(classifyCylinderBreak(3800, 4000)).toBe("fail");
  });
});
