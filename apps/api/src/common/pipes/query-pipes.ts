import { BadRequestException, ParseIntPipe, type ArgumentMetadata, type PipeTransform } from "@nestjs/common";

/** An optional whole-number query parameter (?year=, ?days=, ?weeks=): absent stays undefined, anything
 * that isn't an integer is a 400 — never a NaN passed on to become a 500 inside a Prisma query. */
export const OptionalIntPipe = new ParseIntPipe({ optional: true });

/** A date query parameter (?from=, ?to=) checked for being a real date and passed on unchanged, so
 * services keep taking the string they always did; absent stays undefined. "abc" used to become an
 * Invalid Date and a 500 from Prisma — now it's a 400 naming the parameter. */
export class DateQueryPipe implements PipeTransform<string | undefined, string | undefined> {
  transform(value: string | undefined, metadata: ArgumentMetadata): string | undefined {
    if (value === undefined || value === "") return undefined;
    if (Number.isNaN(new Date(value).getTime())) throw new BadRequestException(`"${metadata.data}" must be a date, e.g. 2026-09-01`);
    return value;
  }
}

/** A comma-separated list of ids (?projectIds=a,b,c); absent or empty is an empty list. */
export class IdListQueryPipe implements PipeTransform<string | undefined, string[]> {
  transform(value: string | undefined): string[] {
    return (value ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  }
}
