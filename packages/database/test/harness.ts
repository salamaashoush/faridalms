import { SQL } from "bun";

import type { RUNTIME_ROLES } from "../src/provision";
import type { SeededTenant } from "../src/seed";

import { openCell, openOwner } from "../src/context";
import { localKek } from "../src/crypto";
import { migrate } from "../src/migrate";
import {
  createCellDatabase,
  dropDatabase,
  LOGIN_ROLES,
  provisionRoles,
} from "../src/provision";
import { seedCell } from "../src/seed";
import { completeFixture } from "./fixture";

export const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  "postgres://northwind:northwind@127.0.0.1:5433/postgres";

const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
export const DATABASE = `cell_test_${suffix}`;
export const CELL = "eg-1";
export const kek = localKek(
  crypto.getRandomValues(new Uint8Array(32)),
  "local:test",
);

const password =
  process.env.CELL_ROLE_PASSWORD ?? crypto.randomUUID().replaceAll("-", "");

export function urlFor(role: string | null) {
  const url = new URL(ADMIN_URL);
  url.pathname = `/${DATABASE}`;
  if (role) {
    url.username = role;
    url.password = password;
  }
  return url.toString();
}

export interface Harness {
  su: SQL;
  tenants: SeededTenant[];
  /** Tenant A is the group of two schools, B the standalone school. */
  a: SeededTenant;
  b: SeededTenant;
  fixtures: Map<string, Awaited<ReturnType<typeof completeFixture>>>;
}

let current: Harness | undefined;

export function harness(): Harness {
  if (!current) throw new Error("The test database is not ready");
  return current;
}

export async function setUp(): Promise<Harness> {
  const admin = new SQL(ADMIN_URL);
  try {
    await provisionRoles(
      admin,
      Object.fromEntries(LOGIN_ROLES.map((role) => [role, password])),
    );
    await createCellDatabase(admin, DATABASE);
  } finally {
    await admin.close();
  }
  await migrate(urlFor(null), { folder: "drizzle", owner: "cell_owner" });
  const owner = openOwner(urlFor(null));
  try {
    const tenants = await seedCell(owner, { kek, cell: CELL });
    const [a, b] = tenants;
    if (!a || !b) throw new Error("the seed makes two tenants");
    const fixtures = new Map<
      string,
      Awaited<ReturnType<typeof completeFixture>>
    >();
    for (const tenant of tenants) {
      const school = tenant.schools[0];
      if (!school) throw new Error("tenant without a school");
      fixtures.set(
        tenant.tenantId,
        await owner.asOwner(tenant.tenantId, "fixture", (tx) =>
          completeFixture(tx, tenant.tenantId, school.id),
        ),
      );
    }
    current = { su: new SQL(urlFor(null)), tenants, a, b, fixtures };
    return current;
  } finally {
    await owner.close();
  }
}

export async function tearDown() {
  await current?.su.close();
  const admin = new SQL(ADMIN_URL);
  try {
    await dropDatabase(admin, DATABASE);
  } finally {
    await admin.close();
  }
}

export type Role = (typeof RUNTIME_ROLES)[number];

export interface ProbeResult<T = Record<string, unknown>> {
  rows: T[];
  count: number;
  /** Rows of every statement, in order. */
  all: Record<string, unknown>[][];
  error?: { code: string; message: string };
}

interface PgError {
  errno?: string;
  code?: string;
  message: string;
}

/**
 * Runs statements as a runtime role, with or without a tenant bound, and
 * always rolls back. Returns the last statement's rows, or its error.
 */
export async function probe<T = Record<string, unknown>>(
  role: Role | "cell_owner",
  tenantId: string | null,
  statements: { text: string; params?: unknown[] }[],
  options: { purpose?: string; sessionTenant?: string } = {},
): Promise<ProbeResult<T>> {
  const { su } = harness();
  const conn = await su.reserve();
  try {
    await conn.unsafe("begin");
    await conn.unsafe(`set local role ${role}`);
    if (options.sessionTenant)
      await conn.unsafe(`set app.tenant_id = '${options.sessionTenant}'`);
    if (tenantId)
      await conn.unsafe(
        "select app.begin_unit($1::uuid, null, null, null, 'probe', 'system')",
        [tenantId],
      );
    if (options.purpose)
      await conn.unsafe("select set_config('app.purpose', $1, true)", [
        options.purpose,
      ]);
    const all: Record<string, unknown>[][] = [];
    let result: ProbeResult<T> = { rows: [], count: 0, all };
    for (const statement of statements) {
      try {
        const rows = (await conn.unsafe(
          statement.text,
          statement.params ?? [],
        )) as T[] & { count?: number };
        all.push([...rows] as Record<string, unknown>[]);
        result = { rows: [...rows], count: rows.count ?? rows.length, all };
      } catch (error) {
        const failure = error as PgError;
        return {
          rows: [],
          count: 0,
          all,
          error: {
            code: failure.errno ?? failure.code ?? "",
            message: failure.message,
          },
        };
      }
    }
    return result;
  } finally {
    await conn.unsafe("rollback").catch(() => undefined);
    await conn.unsafe("reset all").catch(() => undefined);
    conn.release();
  }
}

export function appCell() {
  return openCell({
    app: urlFor("app"),
    site: urlFor("site"),
    integration: urlFor("integration"),
    worker: urlFor("worker"),
  });
}
