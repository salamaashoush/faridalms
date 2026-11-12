import type { CellTransaction } from "@faridalms/database/context";
import type { StoredPreview } from "@faridalms/database/stores/previews";
import type { ModuleId } from "@faridalms/domain/modules";
import type { PublishedPicture } from "@faridalms/domain/previews";

import {
  focusOfFiles,
  previewFolder,
  previewsOf,
} from "@faridalms/database/stores/previews";
import {
  endPublications,
  keepPublishedPicture,
  publicationsOf,
  publishableFiles,
  publishedHolders,
  recordPublication,
  subjectsWithoutConsent,
} from "@faridalms/database/stores/site";
import { platformName } from "@faridalms/domain/hosts";
import { availableModules } from "@faridalms/domain/plans";
import { publicKeyFor } from "@faridalms/domain/website";
import { ORPCError } from "@orpc/server";

import type { ApiDependencies, RequestContext, UnitContext } from "./context";

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
  /** The modules the school's plan includes, which its public pages follow. */
  modules: readonly ModuleId[];
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
        modules: availableModules(school.entitlements),
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

/** What copying a picture's sizes into the public bucket needs. */
type Publishing = Pick<
  ApiDependencies,
  "files" | "publicMedia" | "maxUploadBytes"
> & {
  tx: CellTransaction;
};

/**
 * Puts a picture's sizes in the public folder of its copy, each recorded
 * as a derivative of the publication, those already there left alone; and
 * answers what a page needs to draw it from them, or null when its
 * previews are not a picture's, or not ready.
 */
async function publishSizes(
  publishing: Publishing,
  host: Host,
  file: { id: string; purpose: string },
  publicKey: string,
  preview: StoredPreview | undefined,
  published: ReadonlySet<string>,
  focus: { x: number; y: number } | undefined,
): Promise<PublishedPicture | null> {
  if (
    preview?.state !== "ready" ||
    preview.kind !== "picture" ||
    !preview.width ||
    !preview.height
  )
    return null;
  const folder = publicKey.slice(0, publicKey.lastIndexOf("/"));
  const sizes = preview.sizes.filter((size) => size.name.startsWith("w"));
  for (const size of sizes) {
    const derivative = derivativeOf(size.name);
    if (published.has(derivative)) continue;
    const body = await publishing.files.open(
      `${previewFolder(host.tenantId, preview.id)}/${size.name}`,
    );
    if (!body) throw new ORPCError("CONFLICT", { message: "site.file" });
    await publishing.publicMedia.write(
      `${folder}/${size.name}`,
      body,
      publishing.maxUploadBytes,
    );
    await recordPublication(publishing.tx, {
      tenantId: host.tenantId,
      fileId: file.id,
      purpose: file.purpose,
      publicKey: `${folder}/${size.name}`,
      hostType: host.hostType,
      hostId: host.hostId,
      derivative,
    });
  }
  return {
    width: preview.width,
    height: preview.height,
    ...(preview.placeholder ? { placeholder: preview.placeholder } : {}),
    ...(focus ? { focus } : {}),
    sizes: sizes.map(({ name, width, mediaType }) => ({
      name,
      width,
      mediaType,
    })),
  };
}

/**
 * Makes exactly these files public for a page or post: new ones are copied to
 * the public-media bucket under a fresh key and recorded, ones it no longer
 * shows are withdrawn and their objects deleted. A picture's sizes go into
 * the same public folder, each recorded as a derivative; sizes made after
 * it go up as they are made (`publishLateSizes`). Anyone pictured must
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
  const derived = (fileId: string) =>
    new Set(
      shown
        .filter((row) => row.fileId === fileId && row.derivative !== null)
        .map((row) => row.derivative ?? ""),
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
    const picture = await publishSizes(
      context,
      host,
      file,
      publicKey,
      previews.get(file.storageKey),
      derived(file.id),
      focus.get(file.id),
    );
    if (picture) pictures[file.id] = picture;
  }
  await withdrawMedia(context, host, fileIds);
  return { media, pictures };
}

/** The hosts whose published copies keep their pictures' sizes, by what each copy is. */
const COPIES: Readonly<Record<string, "page" | "post">> = {
  site_page: "page",
  announcement: "post",
};

/**
 * Publishes a picture's sizes once they are made, beside every public copy
 * of it a page or post already shows, and adds them to the copies visitors
 * read, so a page published before its pictures' sizes existed is drawn
 * from them without waiting to be published again.
 */
export async function publishLateSizes(
  publishing: Publishing & { tenantId: string },
  storageKey: string,
): Promise<number> {
  const { tx, tenantId } = publishing;
  const preview = (await previewsOf(tx, tenantId, [storageKey])).get(
    storageKey,
  );
  if (preview?.state !== "ready" || preview.kind !== "picture") return 0;
  const holders = await publishedHolders(tx, { tenantId, storageKey });
  if (holders.length === 0) return 0;
  const focus = await focusOfFiles(
    tx,
    tenantId,
    holders.map((row) => row.fileId),
  );
  let kept = 0;
  for (const holder of holders) {
    const picture = await publishSizes(
      publishing,
      { tenantId, hostType: holder.hostType, hostId: holder.hostId },
      { id: holder.fileId, purpose: holder.purpose },
      holder.publicKey,
      preview,
      new Set(holder.derivatives),
      focus.get(holder.fileId),
    );
    const copy = COPIES[holder.hostType];
    if (picture && copy)
      kept += await keepPublishedPicture(tx, {
        tenantId,
        host: copy,
        hostId: holder.hostId,
        fileId: holder.fileId,
        picture,
      });
  }
  return kept;
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
