import { filesByIds, linkFiles } from "@faridalms/database/stores/files";
import { brandReadable, portalColour } from "@faridalms/domain/brand";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "./context";

import { contributionsTo } from "./extension";
import { forgetFace, portalLooks } from "./portal-face";
import { publishLogo } from "./site";

interface Looks {
  logoFileId: string | null;
  brandColour: string | null;
}

/**
 * The logo and brand colour a school's settings save, each kept where the
 * form leaves it out: a new logo must be a picture the school may link, and
 * a colour must keep every word of the sign-in band readable.
 */
export async function looksToSave(
  context: UnitContext,
  before: Looks | null,
  input: { logoFileId?: string; brandColour?: string },
): Promise<Looks> {
  const logoFileId =
    input.logoFileId === undefined
      ? (before?.logoFileId ?? null)
      : input.logoFileId || null;
  if (logoFileId && logoFileId !== before?.logoFileId) {
    const [file] = await filesByIds(context.tx, context.tenantId, [logoFileId]);
    if (!file?.mediaType.startsWith("image/"))
      throw new ORPCError("BAD_REQUEST", { message: "validation.file_type" });
    const linked = await linkFiles(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      ids: [logoFileId],
      purpose: file.purpose,
      host: { type: "org", id: context.schoolId },
    });
    if (linked.length !== 1)
      throw new ORPCError("CONFLICT", { message: "files.not_linkable" });
  }
  const brandColour =
    input.brandColour === undefined
      ? (before?.brandColour ?? null)
      : input.brandColour || null;
  if (brandColour && !brandReadable(brandColour))
    throw new ORPCError("BAD_REQUEST", { message: "school.brand_unreadable" });
  return { logoFileId, brandColour };
}

/** Shows strangers the school's new looks: its logo's public copy, and its portal's face anew. */
export async function publishLooks(
  context: UnitContext,
  before: Looks | null,
  after: Looks,
) {
  if (after.logoFileId !== (before?.logoFileId ?? null))
    await publishLogo(context, after.logoFileId);
  if (
    after.logoFileId !== (before?.logoFileId ?? null) ||
    after.brandColour !== (before?.brandColour ?? null)
  )
    forgetFace(context.school.slug);
}

/** The colour the sign-in pages take while the school sets none: one a module lends, made readable; null for the platform's. */
export async function unsetColour(
  context: UnitContext,
): Promise<string | null> {
  const looks = await Promise.all(
    (await contributionsTo(context, portalLooks)).map((each) =>
      each.look(context),
    ),
  );
  return portalColour(null, looks.find((each) => each.colour)?.colour ?? null);
}
