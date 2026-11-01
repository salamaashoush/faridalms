export default async function preflight() {
  try {
    const { env } = await import("~/env");
    void env.BACKEND_URL;
  } catch {
    console.error("[preflight] BACKEND_URL must be a valid URL");
    process.exit(1);
  }
  const { platformDomains } = await import("~/server/place");
  if (!platformDomains()) {
    console.error(
      "[preflight] PORTAL_DOMAIN and SITES_DOMAIN must be two different domain names",
    );
    process.exit(1);
  }
}
