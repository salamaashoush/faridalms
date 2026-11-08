import type { CellTransaction } from "@faridalms/database/context";
import type { PublishedPicture } from "@faridalms/domain/previews";

import {
  focusOfFiles,
  previewFolder,
  previewsOf,
} from "@faridalms/database/stores/previews";
import {
  endPublications,
  publicationsOf,
  publishableFiles,
  recordPublication,
  subjectsWithoutConsent,
} from "@faridalms/database/stores/site";
import { platformName } from "@faridalms/domain/hosts";
import { availableModules } from "@faridalms/domain/plans";
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
  /** Where the school's website answers, which its pages name as their own address. */
  siteHost: string;
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
        siteHost:
          school.hosts.site ??
          platformName(school.slug, "site", context.domains),
        now,
      }),
  );
}

/**
 * A school's public website, which only a school with the website module
 * has; anything else answers as if there were no site. The portal's own
 * sign-in face reads the site whatever the plan, through `withPublicSite`.
 */
export async function withWebsite<T>(
  context: RequestContext,
  slug: string,
  run: (unit: PublicUnit) => Promise<T>,
): Promise<T> {
  const school = await context.directory.bySlug(slug);
  if (!school || !availableModules(school.entitlements).includes("website"))
    throw new ORPCError("NOT_FOUND");
  return withPublicSite(context, slug, run);
}

interface Host {
  tenantId: string;
  hostType: string;
  hostId: string;
}

/** A page's or post's public files: each one's key, and what its pictures add. */
export interface PublishedMedia {
  media: Record<string, string>;
  pictures: Record<string, PublishedPicture>;
}

/** A made size's name as a publication's derivative: `w640.avif` is `w640_avif`. */
const derivativeOf = (name: string) => name.replace(/[^a-z0-9]/g, "_");

/**
 * Makes exactly these files public for a page or post: new ones are copied to
 * the public-media bucket under a fresh key and recorded, ones it no longer
 * shows are withdrawn and their objects deleted. A picture's sizes go into
 * the same public folder, each recorded as a derivative, so a size made
 * since the last publication goes up with the next. Anyone pictured must
 * have agreed to appear on the website. Answers each file's public key and
 * what the page needs to show its pictures at the size it draws them.
 */
export async function publishMedia(
  context: UnitContext,
  host: Host,
  fileIds: readonly string[],
): Promise<PublishedMedia> {
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
  const shown = await publicationsOf(tx, host);
  const current = new Map(
    shown
      .filter((row) => row.derivative === null)
      .map((row) => [row.fileId, row.publicKey]),
  );
  const derived = new Set(
    shown.map((row) => `${row.fileId}:${row.derivative ?? ""}`),
  );
  const [previews, focus] = await Promise.all([
    previewsOf(
      tx,
      host.tenantId,
      files.map((file) => file.storageKey),
    ),
    focusOfFiles(
      tx,
      host.tenantId,
      files.map((file) => file.id),
    ),
  ]);
  const media: Record<string, string> = {};
  const pictures: Record<string, PublishedPicture> = {};
  for (const file of files) {
    let publicKey = current.get(file.id);
    if (!publicKey) {
      const body = await context.files.open(file.storageKey);
      if (!body) throw new ORPCError("CONFLICT", { message: "site.file" });
      publicKey = publicKeyFor(file.name);
      await context.publicMedia.write(publicKey, body, context.maxUploadBytes);
      await recordPublication(tx, {
        tenantId: host.tenantId,
        fileId: file.id,
        purpose: file.purpose,
        publicKey,
        hostType: host.hostType,
        hostId: host.hostId,
      });
    }
    media[file.id] = publicKey;
    const preview = previews.get(file.storageKey);
    if (
      preview?.state !== "ready" ||
      preview.kind !== "picture" ||
      !preview.width ||
      !preview.height
    )
      continue;
    const folder = publicKey.slice(0, publicKey.lastIndexOf("/"));
    const sizes = preview.sizes.filter((size) => size.name.startsWith("w"));
    for (const size of sizes) {
      const derivative = derivativeOf(size.name);
      if (derived.has(`${file.id}:${derivative}`)) continue;
      const body = await context.files.open(
        `${previewFolder(host.tenantId, preview.id)}/${size.name}`,
      );
      if (!body) throw new ORPCError("CONFLICT", { message: "site.file" });
      await context.publicMedia.write(
        `${folder}/${size.name}`,
        body,
        context.maxUploadBytes,
      );
      await recordPublication(tx, {
        tenantId: host.tenantId,
        fileId: file.id,
        purpose: file.purpose,
        publicKey: `${folder}/${size.name}`,
        hostType: host.hostType,
        hostId: host.hostId,
        derivative,
      });
    }
    const subject = focus.get(file.id);
    pictures[file.id] = {
      width: preview.width,
      height: preview.height,
      ...(preview.placeholder ? { placeholder: preview.placeholder } : {}),
      ...(subject ? { focus: subject } : {}),
      sizes: sizes.map(({ name, width, mediaType }) => ({
        name,
        width,
        mediaType,
      })),
    };
  }
  await withdrawMedia(context, host, fileIds);
  return { media, pictures };
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
): Promise<PublishedMedia> {
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
    shown.find(
      (row) => row.fileId === school.logoFileId && row.derivative === null,
    )?.publicKey ?? null
  );
}
