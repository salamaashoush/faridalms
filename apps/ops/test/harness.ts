import type { BusinessDb } from "@faridalms/database/business/client";
import type { DirectoryAdmin } from "@faridalms/database/directory/admin";

import { openBusiness } from "@faridalms/database/business/client";
import { openDirectoryAdmin } from "@faridalms/database/directory/admin";
import { migrate, MIGRATIONS } from "@faridalms/database/migrate";
import {
  createBusinessDatabase,
  createDirectoryDatabase,
  dropDatabase,
  LOGIN_ROLES,
  provisionRoles,
} from "@faridalms/database/provision";
import { MODULE_IDS } from "@faridalms/domain/modules";
import { DEFAULT_LIMITS } from "@faridalms/domain/plans";
import { SQL } from "bun";
import { randomBytes } from "node:crypto";

const adminUrl =
  process.env.DATABASE_ADMIN_URL ??
  "postgres://farida:farida@127.0.0.1:5433/postgres";
const suffix = randomBytes(6).toString("hex");
const businessName = `business_ops_${suffix}`;
const directoryName = `directory_ops_${suffix}`;
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

let state:
  | {
      business: ReturnType<typeof openBusiness>;
      directory: DirectoryAdmin;
    }
  | undefined;

/** A throwaway business database and directory, as the console reaches them. */
export async function setUp() {
  const admin = new SQL(adminUrl);
  await provisionRoles(
    admin,
    Object.fromEntries(LOGIN_ROLES.map((role) => [role, password])),
  );
  await createBusinessDatabase(admin, businessName);
  await createDirectoryDatabase(admin, directoryName);
  await admin.close();
  await migrate(urlFor(businessName), {
    folder: MIGRATIONS.business,
    owner: "business_owner",
  });
  await migrate(urlFor(directoryName), {
    folder: MIGRATIONS.directory,
    owner: "directory_owner",
  });
  state = {
    business: openBusiness(urlFor(businessName, "business_admin")),
    directory: openDirectoryAdmin(urlFor(directoryName, "directory_admin")),
  };
}

export async function tearDown() {
  await state?.business.close();
  await state?.directory.close();
  const admin = new SQL(adminUrl);
  await dropDatabase(admin, businessName);
  await dropDatabase(admin, directoryName);
  await admin.close();
}

export function directory(): DirectoryAdmin {
  if (!state) throw new Error("the test databases are not set up");
  return state.directory;
}

/**
 * A tenant and its schools in the test directory, active, each school with
 * the entitlements given (every module and the default storage otherwise).
 */
export async function tenantWith(
  slugs: string[],
  options: {
    country?: string;
    modules?: readonly string[];
    trialEndsOn?: string;
    notice?: string;
  } = {},
): Promise<{ tenantId: string; schoolIds: string[] }> {
  const sql = new SQL(urlFor(directoryName));
  const tenantId = crypto.randomUUID();
  const schoolIds = slugs.map(() => crypto.randomUUID());
  try {
    await sql`insert into cells (id, jurisdiction, provider, region, app_host, api_base_url, state)
      values ('eg-1', 'EG', 'local', 'local', 'localhost', 'http://127.0.0.1:3001', 'open')
      on conflict (id) do nothing`;
    await sql`insert into tenants (id, kind, name_en, name_ar, cell_id, jurisdictions, state)
      values (${tenantId}, ${slugs.length > 1 ? "school_group" : "school"}, ${`${slugs[0]} schools`},
        null, 'eg-1', ${`{${options.country ?? "EG"}}`}::text[], 'active')`;
    for (const [index, slug] of slugs.entries()) {
      await sql`insert into schools (id, tenant_id, slug, name_en, name_ar, placement)
        values (${schoolIds[index]}, ${tenantId}, ${slug}, ${slug}, null, 'cell')`;
      await sql`insert into school_entitlements (school_id, modules, pool_bytes, class_bytes, module_bytes, person_bytes,
          trial_ends_on, notice)
        values (${schoolIds[index]}, ${`{${(options.modules ?? MODULE_IDS).join(",")}}`}::text[],
          ${DEFAULT_LIMITS.poolBytes}, ${DEFAULT_LIMITS.classBytes}, ${DEFAULT_LIMITS.moduleBytes},
          ${DEFAULT_LIMITS.personBytes}, ${options.trialEndsOn ?? null}, ${options.notice ?? null})`;
    }
  } finally {
    await sql.close();
  }
  return { tenantId, schoolIds };
}

export function business(): BusinessDb {
  if (!state) throw new Error("the test databases are not set up");
  return state.business.db;
}

/** The business database as the console's own login reaches it, for raw checks. */
export const businessUrl = () => urlFor(businessName, "business_admin");
/** The test directory as the console reaches it. */
export const directoryUrl = () => urlFor(directoryName, "directory_admin");
