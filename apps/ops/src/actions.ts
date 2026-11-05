/** Sends the operator to sign in again, then back to this page. */
export function signInAgain() {
  window.location.assign(
    `/auth/login?step=1&return=${encodeURIComponent(window.location.pathname + window.location.search)}`,
  );
}

/**
 * What an operator is told when an action fails, or null when the console
 * is sending them to sign in again first.
 */
export function failure(error: unknown, fallback: string): string | null {
  const code = error instanceof Error ? error.message : "";
  if (code === "STEP_UP") {
    signInAgain();
    return null;
  }
  if (code === "FORBIDDEN")
    return "Your role does not cover this. Ask an owner of the console.";
  if (code === "NO_BUSINESS")
    return "This needs the business database, which this console runs without.";
  return fallback;
}
