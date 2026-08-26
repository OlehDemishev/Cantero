import { BadRequestException } from "@nestjs/common";
import { assertPasswordPolicy } from "./password-policy";

describe("assertPasswordPolicy", () => {
  it("rejects a password shorter than the configured minimum", () => {
    expect(() => assertPasswordPolicy("short1!", { passwordMinLength: 10, passwordRequireSymbol: false })).toThrow(
      BadRequestException,
    );
  });

  it("accepts a password meeting the minimum length when no symbol is required", () => {
    expect(() => assertPasswordPolicy("longenough", { passwordMinLength: 8, passwordRequireSymbol: false })).not.toThrow();
  });

  it("rejects a long-enough password with no symbol when a symbol is required", () => {
    expect(() => assertPasswordPolicy("longenough", { passwordMinLength: 8, passwordRequireSymbol: true })).toThrow(
      BadRequestException,
    );
  });

  it("accepts a password meeting both length and symbol requirements", () => {
    expect(() => assertPasswordPolicy("longenough!", { passwordMinLength: 8, passwordRequireSymbol: true })).not.toThrow();
  });
});
