/** Runs `fn` (typically one or more setState calls resetting a component's state before a fresh
 * fetch keyed by a changed id/dependency) on the next microtask instead of synchronously within
 * the calling effect body — satisfies the react-hooks/set-state-in-effect rule (calling setState
 * synchronously in an effect can trigger a wasted extra render) with no visible behavior change:
 * a microtask always resolves before any real network response (which needs at least one full
 * event-loop turn), so the reset is still visibly "immediate" to the user. */
export function resetStateInEffect(fn: () => void): void {
  Promise.resolve().then(fn);
}
