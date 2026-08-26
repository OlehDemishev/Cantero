import { BadRequestException } from "@nestjs/common";

const SYMBOL_PATTERN = /[^A-Za-z0-9]/;

/** Enforces a company's configured password policy (Company.passwordMinLength/passwordRequireSymbol)
 * wherever a new password is set for one of its members — invite acceptance, password reset. Signup
 * itself is exempt: it's creating the company, so there's no policy to check against yet. */
export function assertPasswordPolicy(password: string, company: { passwordMinLength: number; passwordRequireSymbol: boolean }): void {
  if (password.length < company.passwordMinLength) {
    throw new BadRequestException(`Password must be at least ${company.passwordMinLength} characters`);
  }
  if (company.passwordRequireSymbol && !SYMBOL_PATTERN.test(password)) {
    throw new BadRequestException("Password must include at least one symbol");
  }
}
