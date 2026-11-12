import type { Capability } from "@faridalms/domain/capabilities";
import type { FilePurpose } from "@faridalms/domain/file";

import {
  adoptFiles,
  areaFiles,
  areaKindCounts,
  captionDraftOf,
  areaStorage,
  fileById,
  filesByIds,
  initiateFile,
  renameAreaFile,
  requestCaptionDraft,
  setSubjects,
  subjectsOf,
  trashAreaFile,
} from "@faridalms/database/stores/files";
import { focusOfFiles, previewsOf } from "@faridalms/database/stores/previews";
import {
  areaQuerySchema,
  fileAreaSchema,
  fileFamily,
  storedName,
  initiateUploadSchema,
  isDocumentVideo,
  picturedSchema,
  safeFilename,
  SPEECH_LANGUAGES,
  tagPicturedSchema,
  UPLOAD_PART_BYTES,
} from "@faridalms/domain/file";
import { paged, pageWindow } from "@faridalms/domain/paging";
import { limitsOf } from "@faridalms/domain/plans";
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
import { studentsReached } from "../core/reach";
import { canReadFile, mayKeepArea, usesNamed } from "../files/authorize";
import { withFileGate } from "../files/gate";
import { replaceBytes, roomFor, versionsOf } from "../files/keeping";
import { captioning, hasVideo, streamsMore, uploadLimit } from "../files/limit";
import { previewFacts } from "../files/previews";

/** Who may upload for each purpose; none, anyone signed in, its use checked where it is put. */
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
  ],
  site_media: ["site:manage", "announcements:manage"],
  avatar: null,
  // A family's note for an absence; it is of use only once a report holds it.
  evidence: null,
  // A family's document for an application, or one the office files for it.
  admission_document: ["applications:submit", "admissions:manage"],
  // The health staff's report on a record, or a family's for a change they ask for.
  health_report: ["health:write", "children:read"],
  // A court order or other custody paper, kept by the staff who keep custody.
  legal_document: ["custody:write"],
  // Whoever writes in a conversation; the conversation they put it in decides who reads it.
  message_attachment: ["messages:send"],
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
    const videoHoursReached =
      context.mediaOrigin !== null &&
      isDocumentVideo(input.purpose, mediaType) &&
      hasVideo(context.school.entitlements) &&
      !(await streamsMore(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        entitlements: context.school.entitlements,
      }));
    const name = safeFilename(input.name);
    const file = await withFileGate(context.tx, input.purpose, (tx) =>
      initiateFile(tx, {
        tenantId: context.tenantId,
        userId: context.actor.userId,
        orgId: context.schoolId,
        purpose: input.purpose,
        name: storedName(input.purpose, name),
        mediaType,
        sizeBytes: input.sizeBytes,
        trim: input.trim,
      }),
    );
    return {
      id: file.id,
      // The name it was given, which a report keeps only in its record.
      name,
      mediaType: file.mediaType,
      sizeBytes: file.sizeBytes,
      // A file larger than this goes up in parts of this size.
      partBytes: context.uploadPartBytes ?? UPLOAD_PART_BYTES,
      warning,
      // The school's streamed videos fill its hours, so this one plays as uploaded.
      videoHoursReached,
    };
  });

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
  .input(areaQuerySchema)
  .handler(async ({ input, context }) => {
    await keptArea(context, input.area);
    const limits = limitsOf(context.school.entitlements);
    const [{ rows, total }, kinds] = await Promise.all([
      areaFiles(context.tx, context.tenantId, input.area, input.trashed, {
        ...input,
        ...pageWindow(input.page),
      }),
      areaKindCounts(
        context.tx,
        context.tenantId,
        input.area,
        input.trashed,
        input.q,
      ),
    ]);
    return {
      files: paged(await usesNamed(context, rows), total, input.page),
      kinds,
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
 * show them, with what their previews add: a picture's size, placeholder
 * and subject, a recording's waveform, a document's first page. Only files
 * the reader may open are answered.
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
    const shown = readable.filter((file) => file !== null);
    const [previews, focus] = await Promise.all([
      previewsOf(
        context.tx,
        context.tenantId,
        shown
          .filter((file) => file.keyVersion === null)
          .map((file) => file.storageKey),
      ),
      focusOfFiles(
        context.tx,
        context.tenantId,
        shown.map((file) => file.id),
      ),
    ]);
    return {
      files: shown.map((file) => ({
        id: file.id,
        name: file.name,
        mediaType: file.mediaType,
        sizeBytes: file.sizeBytes,
        ...previewFacts(
          file.keyVersion === null ? previews.get(file.storageKey) : undefined,
        ),
        focus: focus.get(file.id) ?? null,
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
    if (!captioning(context))
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
    if (!captioning(context)) return { available: false, draft: null };
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
    return { versions: await versionsOf(context, input.id) };
  });

/**
 * Replaces a file's bytes with the viewer's new upload, or with one of its
 * previous versions, as `replaceBytes` does.
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
    await replaceBytes(context, target, input.sourceId, {
      hostType: input.area.type,
      hostId: input.area.id,
    });
    return { ok: true };
  });

/** Those who put pictures of students in front of others: announcements and the website. */
const PHOTO_EDITORS: Capability[] = ["announcements:manage", "site:manage"];

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
    const students = [...new Set(input.studentIds)];
    const reached = await studentsReached(context, "people", students);
    if (reached.size < students.length) throw new ORPCError("NOT_FOUND");
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
