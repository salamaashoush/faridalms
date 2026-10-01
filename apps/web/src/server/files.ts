import { fileAreaSchema, initiateUploadSchema } from "@faridalms/domain/file";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend } from "./backend";
import { checked } from "./input";

export const initiateUpload = createServerFn({ method: "POST" })
  .validator(checked(initiateUploadSchema))
  .handler(({ data }) => backend().files.initiate(data));

export const getAreaFiles = createServerFn({ method: "GET" })
  .validator(checked(v.object({ area: fileAreaSchema, trashed: v.boolean() })))
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
