/**
 * Builds the two production images and runs them on the host network against
 * the developer's databases, then checks the health endpoints, a real sign-in
 * through the API and a rendered page through the web, and finally stops each
 * container and expects it to exit cleanly within its grace period.
 *
 *   bun run smoke:containers
 */
import { $ } from "bun";

const API_PORT = 3181;
const WEB_PORT = 3180;
const tag = `smoke-${Date.now()}`;
const secret = process.env.SESSION_SECRET ?? "";
const API_ENV = [
  "CELL_APP_URL",
  "CELL_SITE_URL",
  "DIRECTORY_URL",
  "CELL_ID",
  "CELL_KEK",
  "CELL_SECRET",
] as const;
for (const name of [
  "CELL_APP_URL",
  "DIRECTORY_URL",
  "CELL_ID",
  "CELL_KEK",
  "CELL_SECRET",
])
  if (!process.env[name]) throw new Error(`${name} is not set`);
const apiEnv = API_ENV.flatMap((name) =>
  process.env[name] ? ["-e", `${name}=${process.env[name]}`] : [],
);

const started: string[] = [];
const outcomes: boolean[] = [];

function report(label: string, ok: boolean, detail = "") {
  outcomes.push(ok);
  console.log(
    `${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`,
  );
}

async function waitFor(url: string, attempts = 40): Promise<Response | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // The container is still starting.
    }
    await Bun.sleep(500);
  }
  return null;
}

async function stopCleanly(container: string, label: string) {
  const stop = await $`docker stop --time 30 ${container}`.quiet().nothrow();
  const exit = (
    await $`docker inspect --format '{{.State.ExitCode}}' ${container}`.text()
  ).trim();
  report(
    `${label} stops within its grace period`,
    stop.exitCode === 0 && exit === "0",
    `exit code ${exit}`,
  );
}

try {
  console.log("Building images…");
  await $`docker build --target api -t faridalms-api:${tag} .`.quiet();
  await $`docker build --target web -t faridalms-web:${tag} .`.quiet();
  report("both images build", true);

  const api = (
    await $`docker run -d --network host ${apiEnv} -e API_PORT=${API_PORT} -e FILE_STORAGE_DIR=/tmp/files faridalms-api:${tag}`.text()
  ).trim();
  started.push(api);
  const live = await waitFor(`http://127.0.0.1:${API_PORT}/health/live`);
  report("api answers /health/live", live !== null);
  const ready = await waitFor(`http://127.0.0.1:${API_PORT}/health/ready`);
  report("api answers /health/ready with the cell reachable", ready !== null);
  const signIn = await fetch(
    `http://127.0.0.1:${API_PORT}/v1/identity/signIn`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-farida-school": "northwind",
      },
      body: JSON.stringify({
        loginName: "principal.northwind@northwind.example.com",
        password: "farida-development-password",
      }),
    },
  );
  report(
    "api signs the seeded principal in on the cell",
    signIn.status === 200,
    `status ${signIn.status}`,
  );

  const web = (
    await $`docker run -d --network host -e BACKEND_URL=http://127.0.0.1:${API_PORT} -e PORT=${WEB_PORT} -e SESSION_SECRET=${secret} faridalms-web:${tag}`.text()
  ).trim();
  started.push(web);
  const webHealth = await waitFor(`http://127.0.0.1:${WEB_PORT}/api/health`);
  report("web answers /api/health", webHealth !== null);
  const page = await fetch(`http://127.0.0.1:${WEB_PORT}/sign-in`);
  const html = await page.text();
  report(
    "web renders the sign-in page",
    page.status === 200 && html.includes("<html"),
    `status ${page.status}`,
  );
  const arabic = await fetch(`http://127.0.0.1:${WEB_PORT}/sign-in`, {
    headers: { cookie: "language-tag=ar" },
  });
  report(
    "web renders Arabic on the server",
    (await arabic.text()).includes('dir="rtl"'),
  );

  await stopCleanly(web, "web");
  await stopCleanly(api, "api");
} catch (error) {
  report(
    "smoke run",
    false,
    error instanceof Error ? error.message : String(error),
  );
} finally {
  for (const container of started)
    await $`docker rm -f ${container}`.quiet().nothrow();
  await $`docker rmi faridalms-api:${tag} faridalms-web:${tag}`
    .quiet()
    .nothrow();
}
process.exit(outcomes.every(Boolean) ? 0 : 1);
