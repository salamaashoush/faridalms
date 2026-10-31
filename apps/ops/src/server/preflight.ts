import { opsEnv } from "./env";

export default function preflight() {
  try {
    opsEnv();
  } catch (error) {
    console.error(
      `[preflight] ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }
}
