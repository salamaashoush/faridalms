import type { Cell } from "@faridalms/database/context";
import type { SeededTenant } from "@faridalms/database/seed";
import type { RouterClient } from "@orpc/server";

import { openCell, openOwner } from "@faridalms/database/context";
import { localKek } from "@faridalms/database/crypto";
import { openDirectory } from "@faridalms/database/directory/client";
import { registerTenants } from "@faridalms/database/directory/seed";
import { migrate } from "@faridalms/database/migrate";
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

import type { FileStore } from "../src/files/store";
import type { AppRouter } from "../src/router";

import { createApp } from "../src/app";
import { createKeyRing } from "../src/core/keys";
import { LOCALE_HEADER, SCHOOL_HEADER } from "../src/core/procedure";
import { DiskFileStore } from "../src/files/store";

const adminUrl =
  process.env.DATABASE_ADMIN_URL ??
  "postgres://northwind:northwind@127.0.0.1:5433/postgres";
const suffix = randomBytes(6).toString("hex");
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

interface State {
  tenants: SeededTenant[];
  handler: (request: Request) => Promise<Response>;
  cell: Cell;
  files: FileStore;
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
  await migrate(urlFor(cellName), { folder: "drizzle", owner: "cell_owner" });
  await migrate(urlFor(directoryName), {
    folder: "drizzle-directory",
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
    { app: urlFor(cellName, "app"), worker: urlFor(cellName, "worker") },
    4,
  );
  const directory = openDirectory(urlFor(directoryName, "directory_reader"), 0);
  const files = new DiskFileStore(join(tmpdir(), `farida-api-test-${suffix}`));
  const handler = createApp({
    cell,
    directory,
    keys: createKeyRing(kek, "eg-1"),
    cellId: "eg-1",
    cellSecret: new Uint8Array(randomBytes(32)),
    files,
    scanner: null,
    maxUploadBytes: 1024 * 1024,
  });
  state = {
    tenants,
    handler,
    cell,
    files,
    close: async () => {
      await cell.close();
      await directory.close();
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

export function seeded() {
  if (!state) throw new Error("The API test cell is not ready");
  return state;
}

export function client(school: string, token?: string, locale = "en") {
  const { handler } = seeded();
  const link = new RPCLink({
    url: "http://api.test/rpc",
    headers: () => ({
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

/** A request outside the RPC handler, such as the raw file route. */
export function raw(
  school: string,
  token: string,
  path: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set(SCHOOL_HEADER, school);
  return seeded().handler(
    new Request(`http://api.test${path}`, { ...init, headers }),
  );
}
