export default async function preflight() {
  try {
    const { env } = await import("~/env");
    void env.BACKEND_URL;
  } catch {
    console.error("[preflight] BACKEND_URL must be a valid URL");
    process.exit(1);
  }
}
