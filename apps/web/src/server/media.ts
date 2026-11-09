import {
  addToMediaSchema,
  createFolderSchema,
  cropItemSchema,
  describeItemSchema,
  focusItemSchema,
  folderRefSchema,
  importLinkSchema,
  inDocumentsQuerySchema,
  itemRefSchema,
  keepInMediaSchema,
  mediaQuerySchema,
  moveItemsSchema,
  renameFolderSchema,
  renameTagSchema,
  replaceItemSchema,
  tagItemsSchema,
  tagRefSchema,
  trashItemSchema,
  trashItemsSchema,
} from "@faridalms/domain/media";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend } from "./backend";
import { checked } from "./input";

export const listMedia = createServerFn({ method: "GET" })
  .validator(checked(mediaQuerySchema))
  .handler(({ data }) => backend().media.list(data));

export const mediaItems = createServerFn({ method: "POST" })
  .validator(
    checked(
      v.object({
        ids: v.pipe(
          v.array(v.pipe(v.string(), v.uuid())),
          v.minLength(1),
          v.maxLength(50),
        ),
      }),
    ),
  )
  .handler(({ data }) => backend().media.items(data));

export const mediaUses = createServerFn({ method: "GET" })
  .validator(checked(itemRefSchema))
  .handler(({ data }) => backend().media.uses(data));

export const createMediaFolder = createServerFn({ method: "POST" })
  .validator(checked(createFolderSchema))
  .handler(({ data }) => backend().media.createFolder(data));

export const renameMediaFolder = createServerFn({ method: "POST" })
  .validator(checked(renameFolderSchema))
  .handler(({ data }) => backend().media.renameFolder(data));

export const removeMediaFolder = createServerFn({ method: "POST" })
  .validator(checked(folderRefSchema))
  .handler(({ data }) => backend().media.removeFolder(data));

export const addToMedia = createServerFn({ method: "POST" })
  .validator(checked(addToMediaSchema))
  .handler(({ data }) => backend().media.add(data));

export const keepInMedia = createServerFn({ method: "POST" })
  .validator(checked(keepInMediaSchema))
  .handler(({ data }) => backend().media.keep(data));

export const describeMediaItem = createServerFn({ method: "POST" })
  .validator(checked(describeItemSchema))
  .handler(({ data }) => backend().media.describe(data));

export const moveMediaItems = createServerFn({ method: "POST" })
  .validator(checked(moveItemsSchema))
  .handler(({ data }) => backend().media.move(data));

export const trashMediaItem = createServerFn({ method: "POST" })
  .validator(checked(trashItemSchema))
  .handler(({ data }) => backend().media.trash(data));

export const cropMediaItem = createServerFn({ method: "POST" })
  .validator(checked(cropItemSchema))
  .handler(({ data }) => backend().media.crop(data));

export const trashMediaItems = createServerFn({ method: "POST" })
  .validator(checked(trashItemsSchema))
  .handler(({ data }) => backend().media.trashMany(data));

export const tagMediaItems = createServerFn({ method: "POST" })
  .validator(checked(tagItemsSchema))
  .handler(({ data }) => backend().media.tag(data));

export const renameMediaTag = createServerFn({ method: "POST" })
  .validator(checked(renameTagSchema))
  .handler(({ data }) => backend().media.renameTag(data));

export const removeMediaTag = createServerFn({ method: "POST" })
  .validator(checked(tagRefSchema))
  .handler(({ data }) => backend().media.removeTag(data));

export const mediaVersions = createServerFn({ method: "GET" })
  .validator(checked(itemRefSchema))
  .handler(({ data }) => backend().media.versions(data));

export const replaceMediaItem = createServerFn({ method: "POST" })
  .validator(checked(replaceItemSchema))
  .handler(({ data }) => backend().media.replace(data));

export const mediaInDocuments = createServerFn({ method: "GET" })
  .validator(checked(inDocumentsQuerySchema))
  .handler(({ data }) => backend().media.inDocuments(data));

export const mediaStorage = createServerFn({ method: "GET" }).handler(() =>
  backend().media.storage(),
);

export const importMediaLink = createServerFn({ method: "POST" })
  .validator(checked(importLinkSchema))
  .handler(({ data }) => backend().media.importLink(data));

export const focusMediaItem = createServerFn({ method: "POST" })
  .validator(checked(focusItemSchema))
  .handler(({ data }) => backend().media.focus(data));
