/** Where the gate's stand-in for Anthropic listens (scripts/e2e-anthropic.ts). */
export const ANTHROPIC_STAND_IN = `http://127.0.0.1:${process.env.E2E_ANTHROPIC_PORT ?? "3210"}`;
