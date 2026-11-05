import {
  areaQuerySchema,
  fileAreaSchema,
  initiateUploadSchema,
  picturedSchema,
  SPEECH_LANGUAGES,
  tagPicturedSchema,
} from "@faridalms/domain/file";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend } from "./backend";
import { checked } from "./input";

export const initiateUpload = createServerFn({ method: "POST" })
  .validator(checked(initiateUploadSchema))
  .handler(({ data }) => backend().files.initiate(data));

export const getFileAbilities = createServerFn({ method: "GET" }).handler(() =>
  backend().files.abilities(),
);

export const getAreaFiles = createServerFn({ method: "GET" })
  .validator(checked(areaQuerySchema))
  .handler(({ data }) => backend().files.area(data));

export const addToArea = createServerFn({ method: "POST" })
  .validator(
    checked(
      v.object({
        area: fileAreaSchema,
        ids: v.array(v.pipe(v.string(), v.uuid())),
      }),
    ),
  )
  .handler(({ data }) => backend().files.addToArea(data));

const areaFile = {
  area: fileAreaSchema,
  id: v.pipe(v.string(), v.uuid()),
};

export const renameInArea = createServerFn({ method: "POST" })
  .validator(checked(v.object({ ...areaFile, name: v.string() })))
  .handler(({ data }) => backend().files.renameInArea(data));

export const trashInArea = createServerFn({ method: "POST" })
  .validator(checked(v.object({ ...areaFile, trashed: v.boolean() })))
  .handler(({ data }) => backend().files.trashInArea(data));

export const getFileFacts = createServerFn({ method: "POST" })
  .validator(
    checked(
      v.object({
        ids: v.pipe(
          v.array(v.pipe(v.string(), v.uuid())),
          v.minLength(1),
          v.maxLength(100),
        ),
      }),
    ),
  )
  .handler(({ data }) => backend().files.facts(data));

export const draftCaptions = createServerFn({ method: "POST" })
  .validator(
    checked(
      v.object({
        fileId: v.pipe(v.string(), v.uuid()),
        language: v.picklist(SPEECH_LANGUAGES),
      }),
    ),
  )
  .handler(({ data }) => backend().files.draftCaptions(data));

export const getCaptionDraft = createServerFn({ method: "POST" })
  .validator(checked(v.object({ fileId: v.pipe(v.string(), v.uuid()) })))
  .handler(({ data }) => backend().files.captionDraft(data));

export const getFileVersions = createServerFn({ method: "GET" })
  .validator(checked(v.object(areaFile)))
  .handler(({ data }) => backend().files.versions(data));

export const replaceInArea = createServerFn({ method: "POST" })
  .validator(
    checked(v.object({ ...areaFile, sourceId: v.pipe(v.string(), v.uuid()) })),
  )
  .handler(({ data }) => backend().files.replaceInArea(data));

export const getPictured = createServerFn({ method: "POST" })
  .validator(checked(picturedSchema))
  .handler(({ data }) => backend().files.pictured(data));

export const tagPictured = createServerFn({ method: "POST" })
  .validator(checked(tagPicturedSchema))
  .handler(({ data }) => backend().files.tagPictured(data));
