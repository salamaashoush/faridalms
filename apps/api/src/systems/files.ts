import type { StorageUse } from "@faridalms/database/stores/files";
import type { Capability } from "@faridalms/domain/capabilities";
import type {
  FilePurpose,
  InitiateUploadInput,
  StorageScope,
} from "@faridalms/domain/file";

import {
  adoptFiles,
  areaFiles,
  captionDraftOf,
  areaStorage,
  fileById,
  filesByIds,
  fileVersions,
  initiateFile,
  personStorage,
  renameAreaFile,
  replaceFileBytes,
  requestCaptionDraft,
  schoolStorage,
  setSubjects,
  subjectsOf,
  trashAreaFile,
} from "@faridalms/database/stores/files";
import { isVisibleStudent } from "@faridalms/database/stores/students";
import {
  fileAreaSchema,
  fileFamily,
  initiateUploadSchema,
  picturedSchema,
  safeFilename,
  SPEECH_LANGUAGES,
  tagPicturedSchema,
  UPLOAD_PART_BYTES,
} from "@faridalms/domain/file";
import { limitsOf, WARN_SHARE } from "@faridalms/domain/plans";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { canReadFile, mayKeepArea, mayWorkOn } from "../files/authorize";
import { uploadLimit } from "../files/limit";

/** Who may upload for each purpose; none, anyone signed in, its use checked where it is put. */
const FULL: Record<StorageScope, string> = {
  school: "file.quota_school",
  class: "file.quota_class",
  module: "file.quota_module",
  person: "file.quota_person",
};

const UPLOADERS: Record<FilePurpose, Capability[] | null> = {
  attachment: ["assignments:author", "messages:send"],
  submission: ["own-work:submit"],
  // Students write their answers as documents with files in them.
  document_media: [
    "own-work:submit",
    "assignments:author",
    "learning:author",
    "site:manage",
    "calendar:author",
    "calendar:manage",
    "announcements:manage",
    "news:manage",
  ],
  site_media: ["site:manage", "news:manage"],
  avatar: null,
  // A family's note for an absence; it is of use only once a report holds it.
  evidence: null,
  // A family's document for an application, or one the office files for it.
  admission_document: ["applications:submit", "admissions:manage"],
};

/** What this school's files can have done to them, for an editor to offer. */
export const abilities = readProcedure.handler(({ context }) => ({
  /** Whether a recording's ends can be cut off before it is kept. */
  trim: context.mediaOrigin !== null,
}));

/**
 * Step one of an upload: record who is uploading what, for which purpose, and
 * hand back where to send the bytes. The file only becomes usable once the
 * server has verified what arrived.
 */
export const initiate = writeProcedure
  .input(initiateUploadSchema)
  .handler(async ({ input, context }) => {
    const uploaders = UPLOADERS[input.purpose];
    if (uploaders) requireCapability(context, ...uploaders);
    const mediaType = input.mediaType.toLowerCase().split(";")[0]?.trim() ?? "";
    if (
      input.sizeBytes >
      uploadLimit(context, { purpose: input.purpose, mediaType })
    )
      throw new ORPCError("BAD_REQUEST", { message: "file.too_large" });
    // Only the media service can cut a recording; without one, a recording
    // sent to be cut would stay whole.
    if (input.trim && context.mediaOrigin === null)
      throw new ORPCError("BAD_REQUEST", { message: "file.trim_unavailable" });
    const warning = await roomFor(context, input);
    const file = await initiateFile(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      orgId: context.schoolId,
      purpose: input.purpose,
      name: safeFilename(input.name),
      mediaType,
      sizeBytes: input.sizeBytes,
      trim: input.trim,
    });
    return {
      id: file.id,
      name: file.name,
      mediaType: file.mediaType,
      sizeBytes: file.sizeBytes,
      // A file larger than this goes up in parts of this size.
      partBytes: context.uploadPartBytes ?? UPLOAD_PART_BYTES,
      warning,
    };
  });

/**
 * Checks the storage an upload counts against, refusing one that would not
 * fit, and names the fullest past the warning share. A student's work on an
 * assignment still open to them is never refused, only counted.
 */
async function roomFor(
  context: UnitContext,
  input: InitiateUploadInput,
): Promise<{
  scope: StorageScope;
  usedBytes: number;
  limitBytes: number;
} | null> {
  const destination = input.destination;
  if (
    destination?.type === "work" &&
    (await mayWorkOn(context, destination.id))
  )
    return null;
  const limits = limitsOf(context.school.plan);
  const scopes: { scope: StorageScope; used: StorageUse; limit: number }[] = [
    {
      scope: "school",
      used: await schoolStorage(context.tx, context.tenantId, context.schoolId),
      limit: limits.poolBytes,
    },
  ];
  if (destination?.type === "class" || destination?.type === "module") {
    const area = { type: destination.type, id: destination.id };
    if (!(await mayKeepArea(context, area))) throw new ORPCError("NOT_FOUND");
    scopes.push({
      scope: destination.type,
      used: await areaStorage(context.tx, context.tenantId, area),
      limit:
        destination.type === "class" ? limits.classBytes : limits.moduleBytes,
    });
  } else if (destination?.type === "work" || input.purpose !== "document_media")
    scopes.push({
      scope: "person",
      used: await personStorage(
        context.tx,
        context.tenantId,
        context.actor.userId,
      ),
      limit: limits.personBytes,
    });
  for (const { scope, used, limit } of scopes)
    if (used.usedBytes + input.sizeBytes > limit)
      throw new ORPCError("FORBIDDEN", { message: FULL[scope] });
  const fullest = scopes
    .map(({ scope, used, limit }) => ({
      scope,
      usedBytes: used.usedBytes + input.sizeBytes,
      limitBytes: limit,
    }))
    .toSorted((a, b) => b.usedBytes / b.limitBytes - a.usedBytes / a.limitBytes)
    .at(0);
  return fullest && fullest.usedBytes >= fullest.limitBytes * WARN_SHARE
    ? fullest
    : null;
}

async function keptArea(
  context: UnitContext,
  area: v.InferOutput<typeof fileAreaSchema>,
) {
  if (!(await mayKeepArea(context, area))) throw new ORPCError("NOT_FOUND");
}

const areaFileSchema = v.object({
  area: fileAreaSchema,
  id: v.pipe(v.string(), v.uuid()),
});

/** A class's or module's files, with the lessons and assignments showing each. */
export const area = readProcedure
  .input(v.object({ area: fileAreaSchema, trashed: v.boolean() }))
  .handler(async ({ input, context }) => {
    await keptArea(context, input.area);
    const limits = limitsOf(context.school.plan);
    return {
      files: await areaFiles(
        context.tx,
        context.tenantId,
        input.area,
        input.trashed,
      ),
      usage: {
        ...(await areaStorage(context.tx, context.tenantId, input.area)),
        limitBytes:
          input.area.type === "class" ? limits.classBytes : limits.moduleBytes,
      },
    };
  });

/** Puts the viewer's own new uploads in an area, for its documents to use. */
export const addToArea = writeProcedure
  .input(
    v.object({
      area: fileAreaSchema,
      ids: v.pipe(v.array(v.pipe(v.string(), v.uuid())), v.maxLength(50)),
    }),
  )
  .handler(async ({ input, context }) => {
    await keptArea(context, input.area);
    const added = await adoptFiles(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      host: input.area,
      ids: input.ids,
    });
    return { ids: added };
  });

export const renameInArea = writeProcedure
  .input(
    v.object({
      ...areaFileSchema.entries,
      name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(255)),
    }),
  )
  .handler(async ({ input, context }) => {
    await keptArea(context, input.area);
    if (
      !(await renameAreaFile(context.tx, {
        tenantId: context.tenantId,
        area: input.area,
        id: input.id,
        name: safeFilename(input.name),
      }))
    )
      throw new ORPCError("NOT_FOUND");
    return { ok: true };
  });

/**
 * Deletes a file from an area into its trash, or restores it. Documents
 * showing a deleted file show it as removed until it comes back.
 */
export const trashInArea = writeProcedure
  .input(v.object({ ...areaFileSchema.entries, trashed: v.boolean() }))
  .handler(async ({ input, context }) => {
    await keptArea(context, input.area);
    if (
      !(await trashAreaFile(context.tx, {
        tenantId: context.tenantId,
        area: input.area,
        id: input.id,
        trashed: input.trashed,
      }))
    )
      throw new ORPCError("NOT_FOUND");
    await audit(context, {
      action: input.trashed ? "file.trashed" : "file.restored",
      objectType: "file",
      objectId: input.id,
      details: { hostType: input.area.type, hostId: input.area.id },
    });
    return { ok: true };
  });

/**
 * What files are called and weigh now, for the cards of documents that
 * show them; only files the reader may open are answered.
 */
export const facts = readProcedure
  .input(
    v.object({
      ids: v.pipe(
        v.array(v.pipe(v.string(), v.uuid())),
        v.minLength(1),
        v.maxLength(100),
      ),
    }),
  )
  .handler(async ({ input, context }) => {
    const found = await filesByIds(context.tx, context.tenantId, input.ids);
    const readable = await Promise.all(
      found.map(async (file) =>
        file.state === "ready" && (await canReadFile(context, file))
          ? file
          : null,
      ),
    );
    return {
      files: readable
        .filter((file) => file !== null)
        .map((file) => ({
          id: file.id,
          name: file.name,
          mediaType: file.mediaType,
          sizeBytes: file.sizeBytes,
        })),
    };
  });

async function areaFile(
  context: UnitContext,
  place: v.InferOutput<typeof fileAreaSchema>,
  id: string,
) {
  await keptArea(context, place);
  const file = await fileById(context.tx, context.tenantId, id);
  if (
    !file ||
    file.state !== "ready" ||
    file.trashedAt ||
    file.hostType !== place.type ||
    file.hostId !== place.id
  )
    throw new ORPCError("NOT_FOUND");
  return file;
}

/** Those who put recordings in what they write, and so caption them. */
const CAPTIONERS: Capability[] = [
  "learning:author",
  "assignments:author",
  "announcements:manage",
  "news:manage",
  "site:manage",
];

const captionedSchema = v.object({ fileId: v.pipe(v.string(), v.uuid()) });

/** A recording its asker may caption: theirs to read, and sound or video. */
async function captionable(context: UnitContext, fileId: string) {
  if (!CAPTIONERS.some((capability) => can(context, capability)))
    throw new ORPCError("FORBIDDEN");
  const file = await fileById(context.tx, context.tenantId, fileId);
  const family = file ? fileFamily(file.name, file.mediaType) : null;
  if (
    !file ||
    file.state !== "ready" ||
    (family !== "video" && family !== "audio") ||
    !(await canReadFile(context, file))
  )
    throw new ORPCError("NOT_FOUND");
  return file;
}

/**
 * Asks the media service to draft a recording's captions from what it says,
 * for the teacher to correct before keeping them. Asking again starts over.
 */
export const draftCaptions = writeProcedure
  .input(
    v.object({
      ...captionedSchema.entries,
      language: v.picklist(SPEECH_LANGUAGES),
    }),
  )
  .handler(async ({ input, context }) => {
    if (!context.mediaCaptions)
      throw new ORPCError("SERVICE_UNAVAILABLE", {
        message: "files.no_captions",
      });
    const file = await captionable(context, input.fileId);
    await requestCaptionDraft(context.tx, {
      tenantId: context.tenantId,
      fileId: file.id,
      language: input.language,
      userId: context.actor.userId,
    });
    return { state: "queued" as const };
  });

/** Whether captions can be drafted here, and how a recording's draft is getting on. */
export const captionDraft = readProcedure
  .input(captionedSchema)
  .handler(async ({ input, context }) => {
    if (!context.mediaCaptions) return { available: false, draft: null };
    const file = await captionable(context, input.fileId);
    return {
      available: true,
      draft: await captionDraftOf(context.tx, context.tenantId, file.id),
    };
  });

/** A file's previous versions, while the trash keeps them. */
export const versions = readProcedure
  .input(v.object(areaFileSchema.entries))
  .handler(async ({ input, context }) => {
    await areaFile(context, input.area, input.id);
    const rows = await fileVersions(context.tx, context.tenantId, input.id);
    return {
      versions: rows.map((row) => ({
        id: row.id,
        name: row.name,
        mediaType: row.mediaType,
        sizeBytes: row.sizeBytes,
        replacedAt: row.trashedAt ?? "",
      })),
    };
  });

/**
 * Replaces a file's bytes with the viewer's new upload, or with one of its
 * previous versions, so every document showing it shows the new ones. Only
 * the same kind of file may stand in, so a picture block never receives a
 * spreadsheet. What it held stays as a previous version for 30 days.
 */
export const replaceInArea = writeProcedure
  .input(
    v.object({
      ...areaFileSchema.entries,
      sourceId: v.pipe(v.string(), v.uuid()),
    }),
  )
  .handler(async ({ input, context }) => {
    const target = await areaFile(context, input.area, input.id);
    const source = await fileById(context.tx, context.tenantId, input.sourceId);
    const usable =
      source?.state === "ready" &&
      ((source.hostType === null &&
        source.uploadedByUserId === context.actor.userId &&
        source.purpose === target.purpose) ||
        (source.hostType === "file_version" && source.hostId === target.id));
    if (!source || !usable) throw new ORPCError("NOT_FOUND");
    if (
      fileFamily(source.name, source.mediaType) !==
      fileFamily(target.name, target.mediaType)
    )
      throw new ORPCError("BAD_REQUEST", { message: "file.replace_kind" });
    const replaced = await context.cell.withWorker(
      {
        tenantId: context.tenantId,
        requestId: context.requestId,
        actor: { kind: "system" },
      },
      "write",
      (tx) =>
        replaceFileBytes(tx, {
          tenantId: context.tenantId,
          targetId: target.id,
          sourceId: source.id,
          userId: context.actor.userId,
        }),
    );
    if (!replaced) throw new ORPCError("CONFLICT");
    await audit(context, {
      action: "file.replaced",
      objectType: "file",
      objectId: target.id,
      details: {
        hostType: input.area.type,
        hostId: input.area.id,
        restored: source.hostType === "file_version",
      },
    });
    return { ok: true };
  });

/** Those who put pictures of students in front of others: news and the website. */
const PHOTO_EDITORS: Capability[] = ["news:manage", "site:manage"];

async function readablePictures(context: UnitContext, ids: readonly string[]) {
  const found = await filesByIds(context.tx, context.tenantId, ids);
  const readable = await Promise.all(
    found.map(async (file) =>
      file.state === "ready" &&
      file.mediaType.startsWith("image/") &&
      (await canReadFile(context, file))
        ? file
        : null,
    ),
  );
  return readable.filter((file) => file !== null);
}

/**
 * The students each picture shows, and whether their families agreed to
 * their picture on the website and in school news, so whoever publishes
 * sees who may not appear before trying.
 */
export const pictured = readProcedure
  .input(picturedSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, ...PHOTO_EDITORS);
    const files = await readablePictures(context, input.ids);
    const people = await subjectsOf(context.tx, {
      tenantId: context.tenantId,
      fileIds: files.map((file) => file.id),
      on: context.today,
    });
    return {
      files: files.map((file) => ({
        id: file.id,
        name: file.name,
        people: people
          .filter((row) => row.fileId === file.id)
          .map((row) => ({
            id: row.userId,
            fullNameEn: row.fullNameEn,
            fullNameAr: row.fullNameAr,
            website: row.website,
            news: row.news,
          })),
      })),
    };
  });

/** Records which students a picture shows; publishing then checks their families agreed. */
export const tagPictured = writeProcedure
  .input(tagPicturedSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, ...PHOTO_EDITORS);
    requireCapability(context, "people:read");
    const [file] = await readablePictures(context, [input.id]);
    if (!file) throw new ORPCError("NOT_FOUND");
    const scope = {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      today: context.today,
      viewerId: context.actor.userId,
      schoolWide: can(context, "people:manage"),
    };
    const students = [...new Set(input.studentIds)];
    const visible = await Promise.all(
      students.map((id) => isVisibleStudent(context.tx, scope, id)),
    );
    if (visible.includes(false)) throw new ORPCError("NOT_FOUND");
    await setSubjects(context.tx, {
      tenantId: context.tenantId,
      fileId: file.id,
      userIds: students,
      taggedBy: context.actor.userId,
    });
    await audit(context, {
      action: "file.tag",
      objectType: "file",
      objectId: file.id,
      details: { students: students.length },
    });
    return { id: file.id };
  });
