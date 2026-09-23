import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { map, type Observable } from "rxjs";
import type { AuthUser } from "@cantero/shared";

/** Fields only a Worker row has — so an object carrying one of them is a worker, wherever it's nested. */
const WORKER_ONLY = ["hourlyCost", "ptoBalanceHours", "payrollEmployeeId", "wageClassificationId", "isApprentice", "hasClockInPin"];
/** Pay: a worker's cost rate, and the rate a time entry was costed at. Model-unique names. */
const RATE_FIELDS = ["hourlyCost", "hourlyCostSnapshot"];
/** Personal and payroll details of a worker. `phone` is only dropped from worker objects, since
 * clients and suppliers have phones too. */
const CONTACT_FIELDS = ["phone", "payrollEmployeeId", "ptoBalanceHours"];

/**
 * Takes colleagues' pay rates and personal details out of any response for a member without
 * `people.rates` / `people.contacts` — a worker needs the crew's names to log time, not what each of
 * them costs. Works on whatever a handler returns, however deeply a worker is included, so a new
 * `include: { worker: true }` can't leak them again.
 */
@Injectable()
export class WorkerFieldsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = context.switchToHttp().getRequest()?.user as AuthUser | undefined;
    // No user (public route, internal call) or a user with both: nothing to take out.
    if (!user?.permissions) return next.handle();
    const hideRates = !user.permissions.includes("people.rates");
    const hideContacts = !user.permissions.includes("people.contacts");
    if (!hideRates && !hideContacts) return next.handle();
    return next.handle().pipe(map((body) => redactWorkerFields(body, { hideRates, hideContacts })));
  }
}

export function redactWorkerFields<T>(body: T, opts: { hideRates: boolean; hideContacts: boolean }): T {
  const seen = new WeakSet<object>();
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (value === null || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype || seen.has(value)) return;
    seen.add(value);
    const obj = value as Record<string, unknown>;
    const isWorker = WORKER_ONLY.some((k) => k in obj);
    if (opts.hideRates) for (const k of RATE_FIELDS) delete obj[k];
    if (opts.hideContacts && isWorker) for (const k of CONTACT_FIELDS) delete obj[k];
    for (const v of Object.values(obj)) walk(v);
  };
  walk(body);
  return body;
}
