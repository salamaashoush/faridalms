import type { Cell } from "@faridalms/database/context";
import type { KeyEncryptionKey } from "@faridalms/database/crypto";
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
import { MODULE_IDS } from "@faridalms/domain/modules";
import { DEFAULT_LIMITS } from "@faridalms/domain/plans";
import { addDays } from "@faridalms/domain/school";
import { MemoryProvider } from "@faridalms/mail/providers";
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
import { MODULE_EXTENSIONS } from "../src/extensions";
import { createFilesHost, linkKey } from "../src/files/links";
import { fileKeys } from "../src/files/sealed";
import { DiskFileStore, PUBLIC_KEY } from "../src/files/store";
import { createHostChecks } from "../src/hosts/checks";
import { streamLinkKey } from "../src/media/streams";
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
  /** The cell's key-encryption key, for a test that rotates a school's data key. */
  kek: KeyEncryptionKey;
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
  /** A superuser's connection to the cell, which reads the seed's marks past every school's policies. */
  marks: SQL;
  /** What the seed left in the schools that suites in other files pin, by school and mark. */
  seedMarks: Map<string, string>;
  close: () => Promise<void>;
}
let state: State | undefined;

/**
 * The seeded state other files assert on: each homeroom's students today,
 * how many of a subject class's students today differ from its homeroom's,
 * and which year is each school's current one.
 */
async function readMarks(sql: SQL) {
  const rows: { school: string; mark: string; value: string }[] = await sql`
    with school as (
      select id, tenant_id, (statement_timestamp() at time zone time_zone)::date as today
      from core.orgs where type = 'school'
    ), members as (
      select e.tenant_id, e.class_id, e.user_id from core.enrollments e
      join core.classes c on c.tenant_id = e.tenant_id and c.id = e.class_id
      join school s on s.tenant_id = c.tenant_id and s.id = c.org_id
      where e.role = 'student' and e.status = 'active' and e.valid_during @> s.today
    )
    select h.org_id::text as school, 'homeroom ' || coalesce(c.code || ' ', '') || '(' || c.id || ') students' as mark,
      (select count(*) from members m
        where m.tenant_id = h.tenant_id and m.class_id = h.class_id)::text as value
    from core.homerooms h
    join core.classes c on c.tenant_id = h.tenant_id and c.id = h.class_id
    where h.status = 'active'
    union all
    select l.org_id::text, 'subject class ' || coalesce(c.code || ' ', '') || '(' || c.id || ') students unlike its homeroom',
      (select count(*) from (
        (select user_id from members m where m.tenant_id = l.tenant_id and m.class_id = l.class_id
         except select user_id from members m
           where m.tenant_id = l.tenant_id and m.class_id = l.homeroom_class_id)
        union all
        (select user_id from members m
           where m.tenant_id = l.tenant_id and m.class_id = l.homeroom_class_id
         except select user_id from members m
           where m.tenant_id = l.tenant_id and m.class_id = l.class_id)) differ)::text
    from core.homeroom_classes l
    join core.classes c on c.tenant_id = l.tenant_id and c.id = l.class_id
    where l.status = 'active'
    union all
    select org_id::text, 'current year', id::text from core.academic_sessions
    where type = 'school_year' and lifecycle = 'current' and status = 'active'`;
  return new Map(rows.map((row) => [`${row.school} ${row.mark}`, row.value]));
}

/**
 * Fails the test that just ran when it left a mark of the seed changed,
 * naming the school, so a suite that reads the seed is not failed in its
 * place by whichever file happens to run before it on this platform. The
 * marks then start again from what it left, so only that test fails.
 */
export async function requireSeedMarks() {
  const { marks, seedMarks, tenants } = seeded();
  const now = await readMarks(marks);
  const slugs = new Map(
    tenants.flatMap((tenant) =>
      tenant.schools.map((school) => [school.id, school.slug]),
    ),
  );
  const changed = [...seedMarks].flatMap(([key, value]) => {
    const found = now.get(key) ?? "nothing";
    if (found === value) return [];
    const [schoolId = "", ...mark] = key.split(" ");
    return [
      `${slugs.get(schoolId) ?? schoolId} ${mark.join(" ")}: ${value} became ${found}`,
    ];
  });
  if (changed.length === 0) return;
  for (const key of seedMarks.keys())
    seedMarks.set(key, now.get(key) ?? "nothing");
  throw new Error(
    `This test left the seed changed for other files; put back what it changes in a finally, or use a school of its own:\n${changed.join("\n")}`,
  );
}

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
  const keys = createKeyRing(kek, "eg-1");
  const filesHost = createFilesHost({
    files,
    key: linkKey(cellSecret),
    keys: fileKeys({ cell, keys }),
    origin: FILES_ORIGIN,
    libraries: join(import.meta.dir, "..", "vendor"),
  });
  const mail = new MemoryProvider();
  const dependencies: ApiDependencies = {
    cell,
    directory,
    keys,
    cellId: "eg-1",
    cellSecret,
    domains: DOMAINS,
    edgeAddress: EDGE_ADDRESS,
    hosts,
    schoolNames: sync.schoolNames,
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
    // Commons is never asked from a test: one camel, found in either language.
    commons: (words) =>
      Promise.resolve(
        words.includes("camel")
          ? [
              {
                title: "File:Camel in the desert.jpg",
                image:
                  "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Camel.jpg/1280px-Camel.jpg",
                alt: "A camel resting in the desert",
                credit: {
                  author: "A. Photographer",
                  licence: "CC BY-SA 4.0",
                  licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0",
                  source:
                    "https://commons.wikimedia.org/wiki/File:Camel_in_the_desert.jpg",
                },
              },
            ]
          : [],
      ),
  };
  const handler = createApp(dependencies);
  const marks = new SQL(urlFor(cellName), { max: 1 });
  const seedMarks = await readMarks(marks);
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
    kek,
    hosts,
    logins,
    collabUrl: urlFor(cellName, "collab"),
    files,
    marks,
    seedMarks,
    close: async () => {
      await marks.close();
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

/** The test directory as a cell's servers, its sync job, the operator console and a superuser reach it. */
export function testDirectory() {
  return {
    syncUrl: urlFor(directoryName, "directory_sync"),
    readerUrl: urlFor(directoryName, "directory_reader"),
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

/**
 * Changes some of a school's entitlements in the test directory, as the
 * operator console would; null puts back what the seed gave it, every module
 * and the default storage.
 */
export async function setPlan(
  schoolId: string,
  plan: {
    poolBytes?: number;
    classBytes?: number;
    moduleBytes?: number;
    personBytes?: number;
    modules?: string[];
    customDomains?: number | null;
    videoHours?: number | null;
    students?: number | null;
  } | null,
) {
  const admin = new SQL(urlFor(directoryName));
  const next = {
    ...DEFAULT_LIMITS,
    modules: [...MODULE_IDS],
    customDomains: null,
    videoHours: null,
    students: null,
    ...plan,
  };
  try {
    await admin`
      update school_entitlements set pool_bytes = ${next.poolBytes},
        class_bytes = ${next.classBytes}, module_bytes = ${next.moduleBytes},
        person_bytes = ${next.personBytes},
        modules = ${`{${next.modules.join(",")}}`}::text[],
        custom_domains = ${next.customDomains}, video_hours = ${next.videoHours},
        students = ${next.students},
        revision = revision + 1
      where school_id = ${schoolId}::uuid`;
  } finally {
    await admin.close();
  }
}

/** Runs with a school's plan leaving these modules out, then gives it every module again. */
export async function withoutModules(
  slug: string,
  modules: readonly string[],
  run: () => Promise<void>,
) {
  const school = seeded()
    .tenants.flatMap((tenant) => tenant.schools)
    .find((row) => row.slug === slug);
  if (!school) throw new Error(`no ${slug} school`);
  await setPlan(school.id, {
    modules: MODULE_IDS.filter((module) => !modules.includes(module)),
  });
  try {
    await run();
  } finally {
    await setPlan(school.id, null);
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

/** How a background worker of the test cell learns a school's modules, as the API process gives it. */
export function workerModules() {
  return { directory: seeded().directory, extensions: MODULE_EXTENSIONS };
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

let firstToday: string | undefined;

/**
 * The school's today as the run first saw it. The suites that take
 * registers count their days back from it, each its own number of days, so
 * a run that crosses midnight cannot hand two of them the same register.
 */
export function runDay(today: string) {
  firstToday ??= today;
  return firstToday;
}

/** Fridays and Saturdays, and the seeded Armed Forces Day holiday. */
function offDay(day: string) {
  return (
    [5, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay()) ||
    day === "2026-10-06"
  );
}

/** The `nth` school day back from `day`, counting `day` when it is one. */
export function schoolDayBack(day: string, nth: number) {
  let found = day;
  for (let step = 0; step < nth; step += 1) {
    if (step > 0) found = addDays(found, -1);
    while (offDay(found)) found = addDays(found, -1);
  }
  return found;
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

/** The period a register is taken in, where the timetable plans the day; failing on a register of the whole day. */
export function periodOf<P>(register: { period: P | null }): P {
  if (register.period === null)
    throw new Error("the register is not taken in a period");
  return register.period;
}
