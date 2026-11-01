import type { Cell } from "@faridalms/database/context";
import type { Directory } from "@faridalms/database/directory/client";
import type { SeededTenant } from "@faridalms/database/seed";
import type { DnsFindings } from "@faridalms/domain/hosts";
import type { RouterClient } from "@orpc/server";

import { openCell, openOwner } from "@faridalms/database/context";
import { localKek } from "@faridalms/database/crypto";
import {
  openDirectory,
  openDirectorySync,
} from "@faridalms/database/directory/client";
import { registerTenants } from "@faridalms/database/directory/seed";
import { migrate, MIGRATIONS } from "@faridalms/database/migrate";
import {
  createCellDatabase,
  createDirectoryDatabase,
  dropDatabase,
  LOGIN_ROLES,
  provisionRoles,
} from "@faridalms/database/provision";
import { SEED_PASSWORD, seedCell } from "@faridalms/database/seed";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { SQL } from "bun";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ApiDependencies } from "../src/core/context";
import type { FileStore } from "../src/files/store";
import type { AppRouter } from "../src/router";

import { createApp } from "../src/app";
import { createJavaScriptRunner, createPythonRunner } from "../src/coding/run";
import { createKeyRing } from "../src/core/keys";
import { createLoginIndex } from "../src/core/login-index";
import { LOCALE_HEADER, SCHOOL_HEADER } from "../src/core/procedure";
import { createFilesHost, linkKey } from "../src/files/links";
import { DiskFileStore, PUBLIC_KEY } from "../src/files/store";
import { createHostChecks } from "../src/hosts/checks";
import { streamLinkKey } from "../src/media/streams";
import { MemoryProvider } from "../src/notifications/providers";
import { createProvisioner } from "../src/provisioning/host";

const adminUrl =
  process.env.DATABASE_ADMIN_URL ??
  "postgres://farida:farida@127.0.0.1:5433/postgres";
const suffix = randomBytes(6).toString("hex");
export const FILES_ORIGIN = "http://files.test";
export const MEDIA_ORIGIN = "http://media.test";
/** The platform's names for schools in tests. */
export const DOMAINS = { portal: "example.com", sites: "example.net" };
export const EDGE_ADDRESS = "203.0.113.10";

/**
 * What DNS holds in tests, by hostname, and which hosts answer over TLS.
 * A hostname not listed holds nothing.
 */
export const fakeDns = {
  records: new Map<string, DnsFindings>(),
  servedOverTls: new Set<string>(),
};
const cellName = `cell_api_${suffix}`;
const directoryName = `directory_api_${suffix}`;
const password =
  process.env.CELL_ROLE_PASSWORD ?? randomBytes(24).toString("hex");
const urlFor = (name: string, role?: string) => {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  if (role) {
    url.username = role;
    url.password = password;
  }
  return url.toString();
};

/** The part size tests upload in, small enough for the upload limit here. */
export const PART_BYTES = 64 * 1024;
/** The most a video may weigh in tests: twice what any other file may. */
export const VIDEO_BYTES = 2 * 1024 * 1024;

interface State {
  tenants: SeededTenant[];
  handler: (request: Request) => Promise<Response>;
  /** What the app was built with, for a test that needs it built otherwise. */
  dependencies: ApiDependencies;
  filesHost: (request: Request) => Promise<Response>;
  cell: Cell;
  directory: Directory;
  cellSecret: Uint8Array<ArrayBuffer>;
  logins: ReturnType<typeof createLoginIndex>;
  /** The cell's host access, as the API process holds it. */
  hosts: NonNullable<ApiDependencies["hosts"]>;
  collabUrl: string;
  files: FileStore;
  /** What the app sent by email as it was asked to, such as a sign-in link. */
  mail: MemoryProvider;
  /** The provisioner's listener, as the `provisioner` login, and its secret. */
  provisioner: (request: Request) => Promise<Response>;
  provisionSecret: Uint8Array<ArrayBuffer>;
  close: () => Promise<void>;
}
let state: State | undefined;

export async function setUp() {
  const admin = new SQL(adminUrl);
  await provisionRoles(
    admin,
    Object.fromEntries(LOGIN_ROLES.map((role) => [role, password])),
  );
  await createCellDatabase(admin, cellName);
  await createDirectoryDatabase(admin, directoryName);
  await admin.close();
  await migrate(urlFor(cellName), {
    folder: MIGRATIONS.cell,
    owner: "cell_owner",
  });
  await migrate(urlFor(directoryName), {
    folder: MIGRATIONS.directory,
    owner: "directory_owner",
  });
  const kek = localKek(new Uint8Array(randomBytes(32)), "local:test");
  const owner = openOwner(urlFor(cellName));
  const directorySql = new SQL(urlFor(directoryName, "directory_admin"));
  const tenants = await seedCell(owner, { kek, cell: "eg-1" });
  await registerTenants(directorySql, tenants, {
    id: "eg-1",
    appHost: "localhost",
    apiBaseUrl: "http://127.0.0.1",
  });
  await owner.close();
  await directorySql.close();
  const cell = openCell(
    {
      app: urlFor(cellName, "app"),
      site: urlFor(cellName, "site"),
      worker: urlFor(cellName, "worker"),
      retention: urlFor(cellName, "retention"),
    },
    4,
  );
  const directory = openDirectory(urlFor(directoryName, "directory_reader"), 0);
  const sync = openDirectorySync(
    urlFor(directoryName, "directory_sync"),
    "cell:eg-1",
  );
  const logins = createLoginIndex({
    cell,
    directory,
    sync,
    secret: new Uint8Array(randomBytes(32)),
  });
  for (const tenant of tenants) await logins.refresh(tenant.tenantId);
  const hosts = {
    registry: sync.hosts,
    checks: createHostChecks({
      registry: sync.hosts,
      directory,
      domains: DOMAINS,
      edgeAddress: EDGE_ADDRESS,
      lookup: async (hostname) =>
        fakeDns.records.get(hostname) ?? { txt: [], cname: [], a: [] },
      probe: async (hostname) => fakeDns.servedOverTls.has(hostname),
    }),
  };
  const files = new DiskFileStore(join(tmpdir(), `farida-api-test-${suffix}`));
  const publicMedia = new DiskFileStore(
    join(tmpdir(), `farida-api-test-${suffix}`, "public-media"),
    PUBLIC_KEY,
  );
  const cellSecret = new Uint8Array(randomBytes(32));
  const filesHost = createFilesHost({
    files,
    key: linkKey(cellSecret),
    origin: FILES_ORIGIN,
    libraries: join(import.meta.dir, "..", "vendor"),
  });
  const mail = new MemoryProvider();
  const dependencies: ApiDependencies = {
    cell,
    directory,
    keys: createKeyRing(kek, "eg-1"),
    cellId: "eg-1",
    cellSecret,
    domains: DOMAINS,
    edgeAddress: EDGE_ADDRESS,
    hosts,
    logins,
    trustedProxyHops: 1,
    files,
    publicMedia,
    scanner: null,
    runners: {
      python: createPythonRunner(
        join(import.meta.dir, "..", "vendor", "python"),
      ),
      javascript: createJavaScriptRunner(),
    },
    filesOrigin: FILES_ORIGIN,
    linkKey: linkKey(cellSecret),
    mediaOrigin: MEDIA_ORIGIN,
    mediaCaptions: true,
    streamLinkKey: streamLinkKey(cellSecret),
    maxUploadBytes: 1024 * 1024,
    uploadPartBytes: PART_BYTES,
    maxVideoBytes: VIDEO_BYTES,
    channels: { email: true, sms: false },
    mail,
    productInbox: "sales@example.com",
  };
  const handler = createApp(dependencies);
  const provisioning = openOwner(urlFor(cellName, "provisioner"));
  const provisionSecret = new Uint8Array(randomBytes(32));
  const provisioner = createProvisioner({
    owner: provisioning,
    directory,
    kek,
    cellId: "eg-1",
    domains: DOMAINS,
    mail,
    secret: provisionSecret,
  });
  state = {
    tenants,
    handler,
    dependencies,
    mail,
    provisioner,
    provisionSecret,
    filesHost,
    cell,
    directory,
    cellSecret,
    hosts,
    logins,
    collabUrl: urlFor(cellName, "collab"),
    files,
    close: async () => {
      await cell.close();
      await provisioning.close();
      await directory.close();
      await sync.close();
    },
  };
}

export async function tearDown() {
  await state?.close();
  const admin = new SQL(adminUrl);
  await dropDatabase(admin, cellName);
  await dropDatabase(admin, directoryName);
  await admin.close();
}

/** The test directory as the cell's sync job, the operator console and a superuser reach it. */
export function testDirectory() {
  return {
    syncUrl: urlFor(directoryName, "directory_sync"),
    operatorUrl: urlFor(directoryName, "directory_admin"),
    adminUrl: urlFor(directoryName),
  };
}

/** The test cell as a superuser reaches it, to put a row where no API puts it. */
export function testCell() {
  return { adminUrl: urlFor(cellName) };
}

/**
 * Brings forward to a minute ago the time something set for later goes
 * out, as the database's clock would have reached it, so the clock that
 * tells its readers can be run now.
 */
export async function timeHasCome(
  table: "broadcasts" | "assignments",
  id: string,
) {
  const column = table === "broadcasts" ? "publish_at" : "available_from";
  const admin = new SQL(urlFor(cellName));
  try {
    await admin.unsafe(
      `update core.${table} set ${column} = statement_timestamp() - interval '1 minute'
       where id = $1::uuid`,
      [id],
    );
  } finally {
    await admin.close();
  }
}

/** Writes a school's plan in the test directory, as the operator console would. */
export async function setPlan(
  schoolId: string,
  plan: {
    poolBytes?: number;
    classBytes?: number;
    moduleBytes?: number;
    personBytes?: number;
    modules?: string[];
  } | null,
) {
  const admin = new SQL(urlFor(directoryName));
  try {
    if (plan === null)
      await admin`delete from school_plans where school_id = ${schoolId}::uuid`;
    else
      await admin`
        insert into school_plans (school_id, pool_bytes, class_bytes, module_bytes,
          person_bytes, modules)
        values (${schoolId}::uuid, ${plan.poolBytes ?? null}, ${plan.classBytes ?? null},
          ${plan.moduleBytes ?? null}, ${plan.personBytes ?? null},
          ${plan.modules ? `{${plan.modules.join(",")}}` : null}::text[])
        on conflict (school_id) do update set pool_bytes = excluded.pool_bytes,
          class_bytes = excluded.class_bytes, module_bytes = excluded.module_bytes,
          person_bytes = excluded.person_bytes, modules = excluded.modules`;
  } finally {
    await admin.close();
  }
}

/** The same app over the same cell, with some of what it was built with replaced. */
export function handlerWith(overrides: Partial<ApiDependencies>) {
  return createApp({ ...seeded().dependencies, ...overrides });
}

export function seeded() {
  if (!state) throw new Error("The API test cell is not ready");
  return state;
}

export function client(
  school: string,
  token?: string,
  locale = "en",
  headers: Record<string, string> = {},
) {
  const { handler } = seeded();
  const link = new RPCLink({
    url: "http://api.test/rpc",
    headers: () => ({
      ...headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      [SCHOOL_HEADER]: school,
      [LOCALE_HEADER]: locale,
    }),
    fetch: (request, init) => handler(new Request(request, init)),
  });
  const api: RouterClient<AppRouter> = createORPCClient(link);
  return api;
}

/** Signs a seeded login in and returns a client bound to its session. */
export async function signedIn(school: string, loginName: string) {
  const session = await client(school).identity.signIn({
    loginName,
    password: SEED_PASSWORD,
  });
  return client(school, session.token);
}

export function login(role: string, tenant = 0, index = 0) {
  const found = seeded()
    .tenants[tenant]?.logins.filter((entry) => entry.role === role)
    .at(index);
  if (!found) throw new Error(`no seeded ${role}`);
  return found.loginName;
}

/** Awaits a call that must fail and returns what it threw. */
export async function rejection(call: Promise<unknown>): Promise<unknown> {
  try {
    await call;
  } catch (error) {
    return error;
  }
  throw new Error("The call succeeded but was expected to fail");
}

/** Signs a seeded login in and returns its token beside the bound client. */
export async function sessionFor(school: string, loginName: string) {
  const session = await client(school).identity.signIn({
    loginName,
    password: SEED_PASSWORD,
  });
  return { api: client(school, session.token), token: session.token };
}

/**
 * A request outside the RPC handler, such as the raw file route. A redirect
 * to a signed link is followed on the files host the way a browser would,
 * keeping the range asked for; `redirect: "manual"` stops at the redirect.
 */
export async function raw(
  school: string,
  token: string,
  path: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set(SCHOOL_HEADER, school);
  const response = await seeded().handler(
    new Request(`http://api.test${path}`, { ...init, headers }),
  );
  const location = response.headers.get("location");
  if (
    init.redirect === "manual" ||
    response.status !== 302 ||
    !location?.startsWith(`${FILES_ORIGIN}/`)
  )
    return response;
  const range = headers.get("range");
  return seeded().filesHost(
    new Request(location, {
      method: init.method ?? "GET",
      headers: range ? { range } : {},
    }),
  );
}
