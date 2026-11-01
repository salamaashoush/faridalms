import type { CellTransaction, openOwner } from "@faridalms/database/context";
import type { KeyEncryptionKey } from "@faridalms/database/crypto";
import type {
  Directory,
  DirectorySchool,
} from "@faridalms/database/directory/client";
import type { PlatformDomains } from "@faridalms/domain/hosts";
import type {
  ProvisionResult,
  ProvisionTenant,
  ReissueInvite,
  ReissueResult,
} from "@faridalms/domain/provisioning";

import { writeAudit } from "@faridalms/database/audit";
import { schoolProfile } from "@faridalms/database/stores/identity";
import { replaceContact } from "@faridalms/database/stores/persons";
import {
  schoolAdministrator,
  setStaffRoles,
} from "@faridalms/database/stores/staff";
import { insertPerson, nameColumns } from "@faridalms/database/stores/students";
import { createTenant, tenantLifecycle } from "@faridalms/database/tenants";
import {
  provisionTenantSchema,
  reissueInviteSchema,
} from "@faridalms/domain/provisioning";
import { schoolDate } from "@faridalms/domain/school";
import { ORPCError } from "@orpc/server";
import { sql } from "drizzle-orm";
import * as v from "valibot";

import type { Provider } from "../notifications/providers";
import type { ProvisionOperator, TokenCheck } from "./token";

import { emailSignInLink } from "../core/sign-in-link";
import { createTokenCheck } from "./token";

/**
 * The built-in role a new school's first administrator holds: the only one
 * with every capability, so whatever the school later needs, someone there
 * can grant it.
 */
export const FIRST_ADMINISTRATOR_ROLE = "system_administrator";

export interface ProvisionerDependencies {
  /** The cell as `provisioner`, which may become `cell_owner`. */
  owner: ReturnType<typeof openOwner>;
  directory: Directory;
  kek: KeyEncryptionKey;
  cellId: string;
  /** Where the first administrator's link points: the school's portal. */
  domains: PlatformDomains;
  mail: Provider | null;
  /** Shared with the operator console, which signs every call with it. */
  secret: Uint8Array;
  now?: () => Date;
}

/** What creating a school needs, whoever asks: the console's call or a shell. */
export type ProvisioningDependencies = Omit<ProvisionerDependencies, "secret">;

interface Call {
  deps: ProvisioningDependencies;
  operator: ProvisionOperator;
  requestId: string;
  now: Date;
}

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

function requireMail(deps: ProvisioningDependencies) {
  if (!deps.mail)
    throw new ORPCError("CONFLICT", { message: "sign_in.no_email" });
  return deps.mail;
}

/**
 * The tenant's schools as the directory holds them, in the order asked for.
 * The console writes them before it calls, so a tenant the directory does
 * not place in this cell is refused rather than created here.
 */
async function placedSchools(
  call: Call,
  tenantId: string,
  schoolIds: readonly string[],
): Promise<DirectorySchool[]> {
  const listed = await call.deps.directory.schoolsOfTenant(tenantId);
  const byId = new Map(listed.map((school) => [school.schoolId, school]));
  const placed = schoolIds
    .map((id) => byId.get(id))
    .filter(
      (school): school is DirectorySchool =>
        school !== undefined && school.cellId === call.deps.cellId,
    );
  if (placed.length !== schoolIds.length)
    throw new ORPCError("NOT_FOUND", { message: "tenant.not_in_directory" });
  return placed;
}

async function addAdministrator(
  tx: CellTransaction,
  call: Call,
  scope: { tenantId: string; schoolId: string; today: string },
  person: ProvisionTenant["spec"]["administrator"],
) {
  const names = {
    en: {
      given: person.givenNameEn,
      middle: null,
      family: person.familyNameEn,
    },
    ar: {
      given: person.givenNameAr,
      middle: null,
      family: person.familyNameAr,
    },
  };
  const { id: userId } = await insertPerson(tx, {
    tenantId: scope.tenantId,
    schoolId: scope.schoolId,
    names,
  });
  await writeAudit(tx, scope.tenantId, {
    action: "user.create",
    objectType: "user",
    objectId: userId,
    orgId: scope.schoolId,
    subjectUserId: userId,
    details: { operatorId: call.operator.id },
    change: { table: "core.users", before: null, after: nameColumns(names) },
  });
  await replaceContact(tx, {
    tenantId: scope.tenantId,
    userId,
    kind: "email",
    label: "work",
    value: person.email,
    normalized: person.email,
  });
  await setStaffRoles(tx, scope, userId, {
    roles: [FIRST_ADMINISTRATOR_ROLE],
    positionId: null,
    titleEn: null,
    titleAr: null,
  });
  await writeAudit(tx, scope.tenantId, {
    action: "role.change",
    objectType: "user",
    objectId: userId,
    orgId: scope.schoolId,
    subjectUserId: userId,
    details: {
      roles: [FIRST_ADMINISTRATOR_ROLE],
      positionId: null,
      operatorId: call.operator.id,
    },
  });
  return userId;
}

async function sendLink(
  tx: CellTransaction,
  call: Call,
  input: {
    tenantId: string;
    school: DirectorySchool;
    userId: string;
    loginName?: string;
    locale?: "en" | "ar";
  },
) {
  const sent = await emailSignInLink(tx, {
    tenantId: input.tenantId,
    userId: input.userId,
    school: input.school,
    domains: call.deps.domains,
    loginName: input.loginName,
    linkedByUserId: null,
    mail: requireMail(call.deps),
    now: call.now,
    locale: input.locale,
  });
  await writeAudit(tx, input.tenantId, {
    action: sent.created ? "account.create" : "account.invite",
    objectType: "account",
    objectId: sent.accountId,
    orgId: input.school.schoolId,
    subjectUserId: input.userId,
    details: {
      method: "invite",
      purpose: sent.reset ? "reset" : "invite",
      operatorId: call.operator.id,
    },
  });
  return sent;
}

/**
 * Creates the tenant and its first administrator and emails them a link, all
 * in one owner transaction, so a failed email leaves nothing behind. A
 * tenant the cell already holds is not created again: its administrator with
 * this email is sent a new link, which is what a retry after a lost answer
 * needs.
 */
async function provision(
  call: Call,
  request: ProvisionTenant,
): Promise<ProvisionResult> {
  const { tenantId, schoolIds, spec } = request;
  requireMail(call.deps);
  const placed = await placedSchools(call, tenantId, schoolIds);
  const first = placed[0];
  const firstSpec = spec.schools[0];
  if (!first || !firstSpec) throw new ORPCError("BAD_REQUEST");
  if (placed.some((school, index) => school.slug !== spec.schools[index]?.slug))
    throw new ORPCError("CONFLICT", { message: "tenant.directory_differs" });
  return call.deps.owner.asOwner(tenantId, call.requestId, async (tx) => {
    // Two calls for one tenant wait for each other instead of racing.
    await tx.execute(sql`select app.lock('provision')`);
    const lifecycle = await tenantLifecycle(tx, tenantId);
    if (lifecycle !== null && lifecycle !== "active")
      throw new ORPCError("CONFLICT", { message: "tenant.not_active" });
    const created = lifecycle === null;
    if (created)
      await createTenant(
        tx,
        {
          tenantId,
          kind: spec.kind,
          nameEn: spec.nameEn ?? undefined,
          nameAr: spec.nameAr ?? undefined,
          defaultLocale: spec.defaultLocale,
          jurisdictions: spec.jurisdictions,
          schools: spec.schools.map((school, index) => ({
            id: schoolIds[index],
            nameEn: school.nameEn ?? undefined,
            nameAr: school.nameAr ?? undefined,
            timeZone: school.timeZone,
            countryCode: school.countryCode,
          })),
        },
        { kek: call.deps.kek, cell: call.deps.cellId },
      );
    const scope = {
      tenantId,
      schoolId: first.schoolId,
      today: schoolDate(firstSpec.timeZone, call.now),
    };
    const email = spec.administrator.email;
    const existing = created
      ? null
      : await schoolAdministrator(tx, scope, email);
    if (!created && !existing)
      throw new ORPCError("CONFLICT", { message: "administrator.not_found" });
    const userId =
      existing ?? (await addAdministrator(tx, call, scope, spec.administrator));
    const sent = await sendLink(tx, call, {
      tenantId,
      school: first,
      userId,
      loginName: email,
      locale: spec.defaultLocale,
    });
    return {
      tenantId,
      schoolIds: [...schoolIds],
      created,
      sentTo: sent.sentTo,
      loginName: sent.loginName,
    };
  });
}

/** Sends a school's administrator a new link, for when the first expired. */
async function reissue(
  call: Call,
  request: ReissueInvite,
): Promise<ReissueResult> {
  requireMail(call.deps);
  const [school] = await placedSchools(call, request.tenantId, [
    request.schoolId,
  ]);
  if (!school) throw new ORPCError("NOT_FOUND");
  return call.deps.owner.asOwner(
    request.tenantId,
    call.requestId,
    async (tx) => {
      if ((await tenantLifecycle(tx, request.tenantId)) !== "active")
        throw new ORPCError("NOT_FOUND", { message: "tenant.not_active" });
      const profile = await schoolProfile(tx, request.schoolId);
      if (!profile) throw new ORPCError("NOT_FOUND");
      const userId = await schoolAdministrator(
        tx,
        {
          tenantId: request.tenantId,
          schoolId: request.schoolId,
          today: schoolDate(profile.timeZone ?? "UTC", call.now),
        },
        request.email,
      );
      if (!userId)
        throw new ORPCError("NOT_FOUND", {
          message: "administrator.not_found",
        });
      const sent = await sendLink(tx, call, {
        tenantId: request.tenantId,
        school,
        userId,
      });
      return {
        sentTo: sent.sentTo,
        loginName: sent.loginName,
        reset: sent.reset,
      };
    },
  );
}

const directCall = (
  deps: ProvisioningDependencies,
  operatorId: string,
): Call => ({
  deps,
  operator: { id: operatorId, name: null },
  requestId: crypto.randomUUID(),
  now: deps.now?.() ?? new Date(),
});

/** Creates a tenant as the console's call does, for a caller on the server itself. */
export const provisionTenant = (
  deps: ProvisioningDependencies,
  operatorId: string,
  request: ProvisionTenant,
) => provision(directCall(deps, operatorId), request);

/** Sends an administrator a new link, as the console's call does. */
export const reissueInvite = (
  deps: ProvisioningDependencies,
  operatorId: string,
  request: ReissueInvite,
) => reissue(directCall(deps, operatorId), request);

const ROUTES = {
  "/v1/tenants": async (call: Call, body: unknown) => {
    const parsed = v.safeParse(provisionTenantSchema, body);
    return parsed.success
      ? provision(call, parsed.output)
      : invalid(parsed.issues);
  },
  "/v1/invites": async (call: Call, body: unknown) => {
    const parsed = v.safeParse(reissueInviteSchema, body);
    return parsed.success
      ? reissue(call, parsed.output)
      : invalid(parsed.issues);
  },
} as const;

function invalid(
  issues: [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]],
): never {
  throw new ORPCError("BAD_REQUEST", {
    message: "validation",
    data: v.flatten(issues),
  });
}

const routeOf = (path: string) =>
  path in ROUTES ? ROUTES[path as keyof typeof ROUTES] : null;

/**
 * The provisioner's listener: the only place a tenant is created outside the
 * development seed. It answers nothing but the console's signed calls, and
 * runs only where the process holds the `provisioner` login, never beside
 * the public API's router.
 */
export function createProvisioner(
  deps: ProvisionerDependencies,
  check: TokenCheck = createTokenCheck(deps.secret),
) {
  return async (request: Request): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const started = performance.now();
    const url = new URL(request.url);
    let response: Response;
    let operatorId: string | null = null;
    try {
      const route = routeOf(url.pathname);
      if (url.pathname === "/health/live") response = json({ status: "ok" });
      else if (!route) response = json({ code: "NOT_FOUND" }, 404);
      else if (request.method !== "POST")
        response = json({ code: "METHOD_NOT_SUPPORTED" }, 405);
      else {
        const operator = await check(request.headers.get("authorization"));
        if (!operator) response = json({ code: "UNAUTHORIZED" }, 401);
        else {
          operatorId = operator.id;
          const body: unknown = await request.json().catch(() => null);
          const result = await route(
            {
              deps,
              operator,
              requestId,
              now: deps.now?.() ?? new Date(),
            },
            body,
          );
          response = json(result);
        }
      }
    } catch (error) {
      if (error instanceof ORPCError)
        response = json(
          { code: error.code, message: error.message, data: error.data },
          error.status,
        );
      else {
        console.error(
          JSON.stringify({
            requestId,
            error:
              error instanceof Error
                ? `${error.name}: ${error.message.split("\n")[0]?.slice(0, 200)}`
                : "unknown",
          }),
        );
        response = json({ code: "INTERNAL_SERVER_ERROR", requestId }, 500);
      }
    }
    response.headers.set("x-request-id", requestId);
    console.info(
      JSON.stringify({
        requestId,
        provisioner: true,
        operatorId,
        method: request.method,
        path: url.pathname,
        status: response.status,
        durationMs: Math.round(performance.now() - started),
      }),
    );
    return response;
  };
}
