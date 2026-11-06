import type { BusinessDb } from "@faridalms/database/business/client";
import type { DirectoryAdmin } from "@faridalms/database/directory/admin";

import { savePlanVersion } from "@faridalms/database/business/catalogue";
import { openBusiness } from "@faridalms/database/business/client";
import { saveCustomer } from "@faridalms/database/business/customers";
import { createSubscription } from "@faridalms/database/business/subscriptions";
import { openDirectoryAdmin } from "@faridalms/database/directory/admin";
import { migrate, MIGRATIONS } from "@faridalms/database/migrate";
import {
  createBusinessDatabase,
  createDirectoryDatabase,
  dropDatabase,
  LOGIN_ROLES,
  provisionRoles,
} from "@faridalms/database/provision";
import { BASIC_MODULES, MODULE_IDS } from "@faridalms/domain/modules";
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

/**
 * Runs SQL against the test directory as its owner, to arrange what a cell
 * or the host checker would have written there.
 */
export async function inDirectory<T>(run: (sql: SQL) => Promise<T>) {
  const sql = new SQL(urlFor(directoryName));
  try {
    return await run(sql);
  } finally {
    await sql.close();
  }
}

/** What a school's cell last reported of it: its students, for a census. */
export async function reportStudents(schoolId: string, students: number) {
  const sql = new SQL(urlFor(directoryName));
  try {
    await sql`insert into school_usage (school_id, used_bytes, file_count, students, measured_at)
      values (${schoolId}, 0, 0, ${students}, now())
      on conflict (school_id) do update set students = excluded.students, measured_at = now()`;
  } finally {
    await sql.close();
  }
}

const CONTRACT_OPERATOR = "op-owner";
const GIB = 1024 ** 3;

/**
 * A tenant with one school, run by a customer on a three-instalment
 * contract for 300 students at 350.00 a year from 1 September 2026.
 */
export async function contract(slug: string) {
  const { tenantId, schoolIds } = await tenantWith([slug]);
  const plan = await savePlanVersion(business(), {
    code: `plan_${slug.replaceAll("-", "_")}`,
    nameEn: "Standard",
    nameAr: "القياسية",
    modules: [...BASIC_MODULES],
    limits: {
      poolBytes: 100 * GIB,
      classBytes: GIB,
      moduleBytes: GIB,
      personBytes: GIB / 2,
      students: null,
      staffAccounts: null,
      videoHours: null,
      customDomains: null,
      emailPerMonth: null,
      captionMinutes: null,
    },
    prices: [
      {
        currency: "EGP",
        unit: "student_year",
        amountMinor: 35_000,
        minimumMinor: 0,
      },
    ],
    validFrom: "2026-09-01",
    reason: "Sold",
    by: CONTRACT_OPERATOR,
  });
  const customerId = await saveCustomer(business(), {
    legalNameEn: `${slug} schools`,
    legalNameAr: null,
    taxNumber: "123-456-789",
    commercialRegistry: null,
    address: null,
    country: "EG",
    currency: "EGP",
    reason: "Signed",
    by: CONTRACT_OPERATOR,
    tenantId,
  });
  if (!customerId) throw new Error("customer");
  const subscriptionId = await createSubscription(business(), {
    customerId,
    tenantId,
    currency: "EGP",
    terms: {
      state: "active",
      termStartsOn: "2026-09-01",
      termEndsOn: "2027-09-01",
      trialEndsOn: null,
      renewal: "auto",
      schedule: "three",
      contractedStudents: 300,
      censusOn: "2026-10-31",
      notice: null,
    },
    items: [
      {
        planVersionId: plan,
        addOnVersionId: null,
        quantity: 300,
        unitPriceMinor: 35_000,
        discountPercent: 0,
        schoolIds: [],
        startsOn: "2026-09-01",
      },
    ],
    by: CONTRACT_OPERATOR,
    reason: "Signed",
  });
  return { tenantId, schoolIds, customerId, subscriptionId, plan };
}
