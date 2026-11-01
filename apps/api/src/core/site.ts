import type { CellTransaction } from "@faridalms/database/context";

import {
  endPublications,
  publicationsOf,
  publishableFiles,
  recordPublication,
  subjectsWithoutConsent,
} from "@faridalms/database/stores/site";
import { publicKeyFor } from "@faridalms/domain/website";
import { ORPCError } from "@orpc/server";

import type { RequestContext, UnitContext } from "./context";

import { portalHost } from "./portal";

export interface PublicUnit {
  tx: CellTransaction;
  tenantId: string;
  schoolId: string;
  /** Where the school's portal answers, for the website's way to sign in. */
  portalHost: string;
  now: Date;
}

/**
 * Runs a visitor's read as the site role, for the school the address names.
 * No session is involved, and the role can see nothing but published rows.
 */
export async function withPublicSite<T>(
  context: RequestContext,
  slug: string,
  run: (unit: PublicUnit) => Promise<T>,
): Promise<T> {
  const school = await context.directory.bySlug(slug);
  if (!school) throw new ORPCError("NOT_FOUND");
  return context.cell.withSite(
    {
      tenantId: school.tenantId,
      requestId: context.requestId,
      actor: { kind: "system" },
    },
    (tx, now) =>
      run({
        tx,
        tenantId: school.tenantId,
        schoolId: school.schoolId,
        portalHost: portalHost(school, context.domains),
        now,
      }),
  );
}

interface Host {
  tenantId: string;
  hostType: string;
  hostId: string;
}

/**
 * Makes exactly these files public for a page or post: new ones are copied to
 * the public-media bucket under a fresh key and recorded, ones it no longer
 * shows are withdrawn and their objects deleted. Anyone pictured must have
 * agreed to appear on the website. Answers each file's public key.
 */
export async function publishMedia(
  context: UnitContext,
  host: Host,
  fileIds: readonly string[],
): Promise<Record<string, string>> {
  const { tx } = context;
  const unconsented = await subjectsWithoutConsent(tx, {
    tenantId: host.tenantId,
    fileIds,
    meaning: "photo_website",
    on: context.today,
  });
  if (unconsented.length > 0)
    throw new ORPCError("CONFLICT", { message: "site.consent" });
  const files = await publishableFiles(tx, {
    tenantId: host.tenantId,
    fileIds,
  });
  if (files.length !== new Set(fileIds).size)
    throw new ORPCError("CONFLICT", { message: "site.file" });
  const current = new Map(
    (await publicationsOf(tx, host)).map((row) => [row.fileId, row.publicKey]),
  );
  const media: Record<string, string> = {};
  for (const file of files) {
    const existing = current.get(file.id);
    if (existing) {
      media[file.id] = existing;
      continue;
    }
    const body = await context.files.open(file.storageKey);
    if (!body) throw new ORPCError("CONFLICT", { message: "site.file" });
    const publicKey = publicKeyFor(file.name);
    await context.publicMedia.write(publicKey, body, context.maxUploadBytes);
    await recordPublication(tx, {
      tenantId: host.tenantId,
      fileId: file.id,
      purpose: file.purpose,
      publicKey,
      hostType: host.hostType,
      hostId: host.hostId,
    });
    media[file.id] = publicKey;
  }
  await withdrawMedia(context, host, fileIds);
  return media;
}

/**
 * Withdraws a host's public files, except those it still shows. The objects
 * go once the withdrawal commits, so a rollback never leaves a published
 * page pointing at deleted bytes.
 */
export async function withdrawMedia(
  context: UnitContext,
  host: Host,
  keepFileIds: readonly string[] = [],
): Promise<void> {
  const keys = await endPublications(context.tx, { ...host, keepFileIds });
  if (keys.length === 0) return;
  context.afterCommit(async () => {
    for (const key of keys) await context.publicMedia.remove(key);
  });
}

const logoHost = (tenantId: string, schoolId: string): Host => ({
  tenantId,
  hostType: "org",
  hostId: schoolId,
});

/**
 * Makes the school's logo the one public copy its website and sign-in pages
 * show, withdrawing any it showed before; none clears it.
 */
export function publishLogo(
  context: UnitContext,
  logoFileId: string | null,
): Promise<Record<string, string>> {
  return publishMedia(
    context,
    logoHost(context.tenantId, context.schoolId),
    logoFileId ? [logoFileId] : [],
  );
}

/** Where strangers fetch the school's logo, or null while it has none. */
export async function logoKey(
  tx: CellTransaction,
  tenantId: string,
  school: { id: string; logoFileId: string | null },
): Promise<string | null> {
  if (!school.logoFileId) return null;
  const shown = await publicationsOf(tx, logoHost(tenantId, school.id));
  return (
    shown.find((row) => row.fileId === school.logoFileId)?.publicKey ?? null
  );
}
