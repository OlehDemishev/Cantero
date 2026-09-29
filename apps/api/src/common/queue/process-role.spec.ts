import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { backgroundProviders, processRole } from "./process-role";

function sourceFiles(dir: string, suffix: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path, suffix);
    return path.endsWith(suffix) ? [path] : [];
  });
}

describe("processRole", () => {
  it("defaults to running everything in one process", () => {
    expect(processRole({})).toBe("all");
    expect(processRole({ PROCESS_ROLE: " " })).toBe("all");
  });

  it("accepts api and worker, and rejects anything else", () => {
    expect(processRole({ PROCESS_ROLE: "api" })).toBe("api");
    expect(processRole({ PROCESS_ROLE: "worker" })).toBe("worker");
    expect(() => processRole({ PROCESS_ROLE: "workers" })).toThrow(/must be "api", "worker" or "all"/);
  });
});

describe("backgroundProviders", () => {
  const original = process.env.PROCESS_ROLE;
  afterEach(() => {
    if (original === undefined) delete process.env.PROCESS_ROLE;
    else process.env.PROCESS_ROLE = original;
  });

  it("leaves background work out of an API-only process", () => {
    process.env.PROCESS_ROLE = "api";
    expect(backgroundProviders("a", "b")).toEqual([]);
  });

  it("keeps it in the worker and in a process doing both", () => {
    process.env.PROCESS_ROLE = "worker";
    expect(backgroundProviders("a")).toEqual(["a"]);
    delete process.env.PROCESS_ROLE;
    expect(backgroundProviders("a")).toEqual(["a"]);
  });

  // A processor listed as a plain provider would quietly start consuming its queue inside the API
  // process again.
  it("wraps every queue processor a module registers", () => {
    const root = join(__dirname, "../..");
    const processors = sourceFiles(root, ".ts")
      .filter((f) => !f.endsWith(".spec.ts"))
      .flatMap((f) => [...readFileSync(f, "utf8").matchAll(/@Processor\([^)]*\)\s*export class (\w+)/g)].map((m) => m[1]));
    expect(processors.length).toBeGreaterThan(0);

    const modules = sourceFiles(root, ".module.ts").map((f) => readFileSync(f, "utf8"));
    const unwrapped = processors.filter((name) => {
      const registering = modules.filter((m) => new RegExp(`\\b${name}\\b`).test(m.slice(m.indexOf("@Module("))));
      return registering.length === 0 || registering.some((m) => !m.includes(`backgroundProviders(${name})`));
    });
    expect(unwrapped).toEqual([]);
  });
});
