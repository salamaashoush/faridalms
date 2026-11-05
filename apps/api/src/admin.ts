/**
 * The operator console's two jobs from a shell on the server, for a cell run
 * without the console, as a self-hosted school's usually is:
 *
 *   create-school  writes the school to the directory, creates it in the
 *                  cell with its first administrator, and sends that
 *                  administrator a link to choose a password
 *   invite         sends a school's administrator a new link
 *
 * With compose: `docker compose run --rm admin create-school --help`.
 */
import type { NewSchool } from "@faridalms/domain/provisioning";
import type { Provider } from "@faridalms/mail/providers";

import { openOwner } from "@faridalms/database/context";
import { localKek } from "@faridalms/database/crypto";
import {
  openDirectoryAdmin,
  SlugTakenError,
} from "@faridalms/database/directory/admin";
import { openDirectory } from "@faridalms/database/directory/client";
import { BASIC_MODULES, MODULE_IDS } from "@faridalms/domain/modules";
import { BASIC_ENTITLEMENTS, settableOf } from "@faridalms/domain/plans";
import { newSchoolSchema } from "@faridalms/domain/provisioning";
import { emailGateway } from "@faridalms/mail/gateway";
import { ORPCError } from "@orpc/server";
import { parseArgs } from "node:util";
import * as v from "valibot";

import type { AdminEnv } from "./admin-env";
import type { ProvisioningDependencies } from "./provisioning/host";

import { adminEnv } from "./admin-env";
import { provisionTenant, reissueInvite } from "./provisioning/host";

/** How the directory's change log names whoever ran this. */
const OPERATOR = "server-shell";

const USAGE = `Usage:
  create-school --slug <code> --name <name> --admin-email <email>
                --admin-name <given family> --country <XX> --time-zone <Area/City>
                [--name-ar <name>] [--admin-name-ar <given family>]
                [--locale en|ar] [--jurisdiction <XX>] [--print-link]
                [--modules all|<id,id,...>]
  invite --slug <code> [--email <administrator's email>] [--print-link]

--print-link prints the email, with its link, instead of sending it: for a
server with no email gateway, or to hand the link over yourself.

--modules gives the school more than Basic: every module, or the ones named
(${MODULE_IDS.join(", ")}).`;

/** Shows the message the administrator would have been sent. */
const printer: Provider = {
  send: (message) => {
    console.info(
      `\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`,
    );
    return Promise.resolve({ receipt: null });
  },
};

/** "Amira Hassan" as a given name and a family name. */
function nameParts(full: string | undefined) {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  return parts.length === 0
    ? { given: null, family: null }
    : { given: parts[0] ?? null, family: parts.slice(1).join(" ") || null };
}

class UsageError extends Error {}

function modulesFrom(flag: string | undefined): string[] {
  if (flag === undefined) return [...BASIC_MODULES];
  if (flag === "all") return [...MODULE_IDS];
  const named = flag.split(",").map((id) => id.trim());
  const unknown = named.filter(
    (id) => !(MODULE_IDS as readonly string[]).includes(id),
  );
  if (unknown.length)
    throw new UsageError(`unknown modules: ${unknown.join(", ")}`);
  return named;
}

function schoolFrom(
  flags: Record<string, string | boolean | undefined>,
  env: AdminEnv,
): NewSchool {
  const text = (name: string) =>
    typeof flags[name] === "string" ? flags[name] : undefined;
  for (const name of [
    "slug",
    "name",
    "admin-email",
    "admin-name",
    "country",
    "time-zone",
  ])
    if (!text(name)) throw new UsageError(`--${name} is required`);
  const english = nameParts(text("admin-name"));
  const arabic = nameParts(text("admin-name-ar"));
  const country = text("country") ?? "";
  const parsed = v.safeParse(newSchoolSchema, {
    kind: "school",
    nameEn: text("name"),
    nameAr: text("name-ar") ?? null,
    cellId: env.CELL_ID,
    defaultLocale: text("locale") ?? "en",
    jurisdictions: [text("jurisdiction") ?? env.CELL_JURISDICTION ?? country],
    schools: [
      {
        nameEn: text("name"),
        nameAr: text("name-ar") ?? null,
        slug: text("slug"),
        timeZone: text("time-zone"),
        countryCode: country,
      },
    ],
    administrators: [
      {
        givenNameEn: english.given,
        familyNameEn: english.family,
        givenNameAr: arabic.given,
        familyNameAr: arabic.family,
        email: text("admin-email"),
      },
    ],
    entitlements: {
      ...settableOf(BASIC_ENTITLEMENTS),
      modules: modulesFrom(text("modules")),
    },
  });
  if (!parsed.success)
    throw new UsageError(
      Object.entries(v.flatten(parsed.issues).nested ?? {})
        .map(([path, messages]) => `${path}: ${messages?.join(" ")}`)
        .join("\n") || "the school's details are not valid",
    );
  return parsed.output;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { values: flags } = parseArgs({
    args: rest,
    options: {
      slug: { type: "string" },
      name: { type: "string" },
      "name-ar": { type: "string" },
      "admin-email": { type: "string" },
      "admin-name": { type: "string" },
      "admin-name-ar": { type: "string" },
      email: { type: "string" },
      country: { type: "string" },
      "time-zone": { type: "string" },
      locale: { type: "string" },
      jurisdiction: { type: "string" },
      modules: { type: "string" },
      "print-link": { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (flags.help || (command !== "create-school" && command !== "invite")) {
    console.info(USAGE);
    process.exitCode = flags.help ? 0 : 2;
    return;
  }

  const env = adminEnv();
  const mail = flags["print-link"] ? printer : emailGateway(env);
  if (!mail)
    throw new UsageError(
      "No email gateway is set (RESEND_API_KEY with EMAIL_FROM, or EMAIL_WEBHOOK_URL). Set one, or add --print-link and pass the link on yourself.",
    );
  const owner = openOwner(env.CELL_PROVISION_URL);
  const directory = openDirectory(env.DIRECTORY_URL);
  const admin = openDirectoryAdmin(env.DIRECTORY_ADMIN_URL);
  const deps: ProvisioningDependencies = {
    owner,
    directory,
    kek: localKek(
      new Uint8Array(Buffer.from(env.CELL_KEK, "base64")),
      `local:${env.CELL_ID}`,
    ),
    cellId: env.CELL_ID,
    domains: { portal: env.PORTAL_DOMAIN, sites: env.SITES_DOMAIN },
    mail,
  };
  try {
    if (command === "create-school") {
      const spec = schoolFrom(flags, env);
      const begun = await admin.beginTenant({
        tenantId: Bun.randomUUIDv7(),
        kind: spec.kind,
        nameEn: spec.nameEn,
        nameAr: spec.nameAr,
        cellId: spec.cellId,
        jurisdictions: spec.jurisdictions,
        schools: spec.schools.map((school) => ({
          id: Bun.randomUUIDv7(),
          slug: school.slug,
          nameEn: school.nameEn,
          nameAr: school.nameAr,
        })),
        entitlements: spec.entitlements,
        operatorId: OPERATOR,
      });
      const result = await provisionTenant(deps, OPERATOR, {
        tenantId: begun.tenantId,
        schoolIds: begun.schoolIds,
        spec,
      });
      await admin.activateTenant({
        tenantId: begun.tenantId,
        operatorId: OPERATOR,
      });
      const slug = spec.schools[0]?.slug ?? "";
      console.info(
        `${result.created ? "Created" : "Already there:"} ${slug}, at https://${slug}.${env.PORTAL_DOMAIN} (website https://${slug}.${env.SITES_DOMAIN}).`,
      );
      for (const link of result.sent)
        console.info(
          `${flags["print-link"] ? "The link above is for" : "Sent a link to"} ${link.sentTo}, who signs in as ${link.loginName}.`,
        );
    } else {
      const slug = typeof flags.slug === "string" ? flags.slug : "";
      if (!slug) throw new UsageError("--slug is required");
      const school = await directory.bySlug(slug);
      if (!school) throw new UsageError(`No school has the code ${slug}.`);
      const result = await reissueInvite(deps, OPERATOR, {
        tenantId: school.tenantId,
        schoolId: school.schoolId,
        email: typeof flags.email === "string" ? flags.email : null,
      });
      console.info(
        `${flags["print-link"] ? "The link above is for" : "Sent a link to"} ${result.sentTo}, who signs in as ${result.loginName}.`,
      );
    }
  } finally {
    await Promise.all([owner.close(), directory.close(), admin.close()]);
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof UsageError) {
    console.error(`${error.message}\n\n${USAGE}`);
    process.exitCode = 2;
  } else if (error instanceof SlugTakenError) {
    console.error(
      error.pending
        ? `${error.slugs.join(", ")} belongs to a school still being created with other details; run the command again as it was first given to finish it.`
        : `Another school already has the code ${error.slugs.join(", ")}.`,
    );
    process.exitCode = 1;
  } else if (error instanceof ORPCError) {
    console.error(`Refused: ${error.message}`);
    process.exitCode = 1;
  } else if (error instanceof Error && error.message === "cell.not_open") {
    console.error(
      "This cell is not open in the directory. Run migrate with CELL_ID, PORTAL_DOMAIN and CELL_JURISDICTION set.",
    );
    process.exitCode = 1;
  } else throw error;
}
