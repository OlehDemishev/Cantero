import { ValidationPipe, type ArgumentMetadata } from "@nestjs/common";

/**
 * The app-wide ValidationPipe, with one fix: an absent query/route parameter stays undefined.
 * Nest 10's transformPrimitive turns a missing `?months` declared as `months?: number` into
 * `+undefined` = NaN before the parameter's own pipe runs, so OptionalIntPipe saw NaN, not
 * "absent", and every optional numeric query parameter answered 400 when left out. A value that
 * is present is still converted exactly as before, so "abc" still reaches OptionalIntPipe as NaN
 * and is a 400.
 */
export class AppValidationPipe extends ValidationPipe {
  protected override transformPrimitive(value: unknown, metadata: ArgumentMetadata): unknown {
    if (value === undefined) return undefined;
    return super.transformPrimitive(value, metadata);
  }
}

/** The global pipe main.ts installs — one place, so specs that boot an app use the same one. */
export function globalValidationPipe(): AppValidationPipe {
  return new AppValidationPipe({ whitelist: true, transform: true });
}
