import Ajv from "ajv";
import addFormats from "ajv-formats";

/**
 * Contract-test harness: pins each integration to what its provider actually publishes, rather
 * than to hand-written mocks that only echo what our code already expects (which is how a wrong
 * field name or a missing required field sails through a unit test).
 *
 * Two layers:
 * - `openApiViolations` validates an outgoing request body against the provider's own OpenAPI /
 *   Swagger schema (vendored under ./specs, subset + source URL + retrieval date inside), plus two
 *   checks JSON Schema alone doesn't make: a property the schema doesn't define (a typo or an
 *   invented field) and a property the schema marks readOnly (the provider ignores or rejects it).
 * - `fakeProvider` replaces global fetch with a scripted provider that answers only the routes the
 *   contract lists and throws on anything else, recording every call for assertions.
 */

type Schema = Record<string, any>;

export interface OpenApiDoc {
  openapi?: string;
  swagger?: string;
  components?: { schemas: Record<string, Schema> };
  definitions?: Record<string, Schema>;
  paths: Record<string, Record<string, any>>;
}

function refBag(doc: OpenApiDoc): { prefix: string; schemas: Record<string, Schema> } {
  return doc.openapi ? { prefix: "#/components/schemas/", schemas: doc.components!.schemas } : { prefix: "#/definitions/", schemas: doc.definitions! };
}

function requestSchema(doc: OpenApiDoc, path: string, method: string): Schema {
  const op = doc.paths[path]?.[method.toLowerCase()];
  if (!op) throw new Error(`The vendored spec has no ${method} ${path}`);
  if (op.requestBody) return op.requestBody.content["application/json"].schema;
  const bodyParam = (op.parameters ?? []).find((p: any) => p.in === "body");
  if (!bodyParam) throw new Error(`${method} ${path} takes no JSON body in the spec`);
  return bodyParam.schema;
}

/** Follows $ref and merges allOf, so the strictness walk sees one flat object schema. */
function resolve(doc: OpenApiDoc, schema: Schema | undefined): Schema {
  if (!schema) return {};
  const { prefix, schemas } = refBag(doc);
  if (schema.$ref) return resolve(doc, schemas[String(schema.$ref).slice(prefix.length)]);
  if (schema.allOf) {
    const parts = schema.allOf.map((s: Schema) => resolve(doc, s));
    return {
      ...schema,
      type: schema.type ?? parts.find((p: Schema) => p.type)?.type,
      properties: Object.assign({}, schema.properties, ...parts.map((p: Schema) => p.properties ?? {})),
      readOnly: schema.readOnly ?? parts.some((p: Schema) => p.readOnly),
    };
  }
  return schema;
}

function strictWalk(doc: OpenApiDoc, schema: Schema, value: unknown, at: string, out: string[]): void {
  const s = resolve(doc, schema);
  if (Array.isArray(value)) {
    if (s.items) value.forEach((v, i) => strictWalk(doc, s.items, v, `${at}[${i}]`, out));
    return;
  }
  if (!value || typeof value !== "object") return;
  const props: Record<string, Schema> | undefined = s.properties;
  if (!props || s.additionalProperties) return; // free-form object — nothing to be strict about
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (!(key in props)) {
      out.push(`${at}.${key} is not a property the provider defines`);
      continue;
    }
    const childSchema = resolve(doc, props[key]);
    if (childSchema.readOnly) out.push(`${at}.${key} is readOnly in the provider's schema`);
    strictWalk(doc, props[key], child, `${at}.${key}`, out);
  }
}

/** Every way `body` breaks the provider's published request contract for `method path`; [] when it conforms. */
export function openApiViolations(doc: OpenApiDoc, method: string, path: string, body: unknown): string[] {
  const root = requestSchema(doc, path, method);
  const ajv = new Ajv({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addFormat("decimal-precision-2", true);
  const standalone = doc.openapi ? { ...root, components: doc.components } : { ...root, definitions: doc.definitions };
  const validate = ajv.compile(standalone);
  const out: string[] = [];
  if (!validate(body)) {
    for (const e of validate.errors ?? []) out.push(`body${e.instancePath.replace(/\//g, ".")} ${e.message}${e.params && "missingProperty" in e.params ? ` (${(e.params as { missingProperty: string }).missingProperty})` : ""}`);
  }
  strictWalk(doc, root, body, "body", out);
  return out;
}

export interface RecordedCall {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: any;
}

export interface Route {
  method: string;
  /** Matched against origin + pathname (query string excluded). */
  url: RegExp;
  respond: (call: RecordedCall) => { status?: number; body?: unknown };
}

/** Installs a fetch that answers only `routes`. Anything else throws, naming the request, so an
 * endpoint the contract doesn't list can't be called silently. */
export function fakeProvider(routes: Route[]): { calls: RecordedCall[]; restore: () => void } {
  const original = global.fetch;
  const calls: RecordedCall[] = [];
  global.fetch = (async (input: string | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? "GET").toUpperCase();
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    let body: any = init.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        // form-encoded or plain text — keep as is
      }
    } else if (body instanceof URLSearchParams) {
      body = Object.fromEntries(body);
    }
    const call: RecordedCall = { method, url, headers, body };
    calls.push(call);
    const route = routes.find((r) => r.method === method && r.url.test(url.origin + url.pathname));
    if (!route) throw new Error(`Not in the recorded contract: ${method} ${url.origin}${url.pathname}`);
    const { status = 200, body: responseBody } = route.respond(call);
    return new Response(responseBody === undefined ? null : JSON.stringify(responseBody), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, restore: () => (global.fetch = original) };
}

/**
 * For providers that publish no machine-readable schema (their contract is prose + examples on a
 * docs page): the rules written down from that page. Paths use dots and `[]` for "every element".
 */
export interface DocumentedRule {
  source: string;
  required?: string[];
  /** Top-level keys the documented request may contain; anything else is flagged. */
  allowedTopLevel?: string[];
  enums?: Record<string, readonly unknown[]>;
  patterns?: Record<string, RegExp>;
  forbidden?: string[];
}

function valuesAt(value: unknown, path: string): unknown[] {
  let current: unknown[] = [value];
  // Dataverse keys carry their own dot ("…@odata.type", "…@odata.bind"), so don't split there.
  for (const part of path.split(/(?<!@odata)\./)) {
    const many = part.endsWith("[]");
    const key = many ? part.slice(0, -2) : part;
    current = current.flatMap((v) => {
      const next = v && typeof v === "object" ? (v as Record<string, unknown>)[key] : undefined;
      return many ? (Array.isArray(next) ? next : []) : [next];
    });
  }
  return current;
}

export function documentedViolations(rule: DocumentedRule, body: unknown): string[] {
  const out: string[] = [];
  for (const path of rule.required ?? []) {
    const vals = valuesAt(body, path);
    if (vals.length === 0 || vals.some((v) => v === undefined || v === null || v === "")) out.push(`${path} is required (${rule.source})`);
  }
  for (const path of rule.forbidden ?? []) {
    if (valuesAt(body, path).some((v) => v !== undefined)) out.push(`${path} must not be sent (${rule.source})`);
  }
  if (rule.allowedTopLevel && body && typeof body === "object") {
    for (const key of Object.keys(body)) if (!rule.allowedTopLevel.includes(key)) out.push(`${key} is not a documented field (${rule.source})`);
  }
  for (const [path, allowed] of Object.entries(rule.enums ?? {})) {
    for (const v of valuesAt(body, path)) if (v !== undefined && !allowed.includes(v)) out.push(`${path} = ${JSON.stringify(v)} is not one of ${allowed.join(", ")}`);
  }
  for (const [path, re] of Object.entries(rule.patterns ?? {})) {
    for (const v of valuesAt(body, path)) if (v !== undefined && !re.test(String(v))) out.push(`${path} = ${JSON.stringify(v)} doesn't match ${re}`);
  }
  return out;
}
