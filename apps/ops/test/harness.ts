import type { BusinessDb } from "@faridalms/database/business/client";

import { openBusiness } from "@faridalms/database/business/client";
import { migrate, MIGRATIONS } from "@faridalms/database/migrate";
import {
  createBusinessDatabase,
  createDirectoryDatabase,
  dropDatabase,
  LOGIN_ROLES,
  provisionRoles,
} from "@faridalms/database/provision";
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

let state: { business: ReturnType<typeof openBusiness> } | undefined;

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
  state = { business: openBusiness(urlFor(businessName, "business_admin")) };
}

export async function tearDown() {
  await state?.business.close();
  const admin = new SQL(adminUrl);
  await dropDatabase(admin, businessName);
  await dropDatabase(admin, directoryName);
  await admin.close();
}

export function business(): BusinessDb {
  if (!state) throw new Error("the test databases are not set up");
  return state.business.db;
}

/** The business database as the console's own login reaches it, for raw checks. */
export const businessUrl = () => urlFor(businessName, "business_admin");
/** The test directory as the console reaches it. */
export const directoryUrl = () => urlFor(directoryName, "directory_admin");
