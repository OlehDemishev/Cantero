/**
 * Which half of the app this Node process runs. In production the API (main.ts, PROCESS_ROLE=api)
 * only serves HTTP and puts jobs on the queues, while a separate worker process (worker.ts) runs
 * every queue processor — so OCR, embeddings, reminders and webhook delivery never compete with
 * requests for the same event loop and memory. Unset means "all": one process doing both, which is
 * what local development runs.
 */
export type ProcessRole = "all" | "api" | "worker";

export function processRole(env: NodeJS.ProcessEnv = process.env): ProcessRole {
  const role = env.PROCESS_ROLE?.trim() || "all";
  if (role !== "all" && role !== "api" && role !== "worker") {
    throw new Error(`PROCESS_ROLE="${role}" must be "api", "worker" or "all".`);
  }
  return role;
}

/**
 * Providers that only do background work — a module's queue processors — left out of an API-only
 * process, which just enqueues. Evaluated when the module's file is loaded, so PROCESS_ROLE has to
 * be in the real environment by then (worker.ts sets it itself before loading any module); a value
 * in an .env file read later by ConfigModule comes too late.
 */
export function backgroundProviders<T>(...providers: T[]): T[] {
  return processRole() === "api" ? [] : providers;
}
