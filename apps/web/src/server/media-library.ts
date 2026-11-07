import {
  addToLibrarySchema,
  createFolderSchema,
  cropItemSchema,
  describeItemSchema,
  folderRefSchema,
  itemRefSchema,
  keepInLibrarySchema,
  libraryQuerySchema,
  moveItemsSchema,
  renameFolderSchema,
  trashItemSchema,
} from "@faridalms/domain/media-library";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend } from "./backend";
import { checked } from "./input";

export const listLibrary = createServerFn({ method: "GET" })
  .validator(checked(libraryQuerySchema))
  .handler(({ data }) => backend().mediaLibrary.list(data));

export const libraryItems = createServerFn({ method: "POST" })
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
  .handler(({ data }) => backend().mediaLibrary.items(data));

export const libraryUses = createServerFn({ method: "GET" })
  .validator(checked(itemRefSchema))
  .handler(({ data }) => backend().mediaLibrary.uses(data));

export const createLibraryFolder = createServerFn({ method: "POST" })
  .validator(checked(createFolderSchema))
  .handler(({ data }) => backend().mediaLibrary.createFolder(data));

export const renameLibraryFolder = createServerFn({ method: "POST" })
  .validator(checked(renameFolderSchema))
  .handler(({ data }) => backend().mediaLibrary.renameFolder(data));

export const removeLibraryFolder = createServerFn({ method: "POST" })
  .validator(checked(folderRefSchema))
  .handler(({ data }) => backend().mediaLibrary.removeFolder(data));

export const addToLibrary = createServerFn({ method: "POST" })
  .validator(checked(addToLibrarySchema))
  .handler(({ data }) => backend().mediaLibrary.add(data));

export const keepInLibrary = createServerFn({ method: "POST" })
  .validator(checked(keepInLibrarySchema))
  .handler(({ data }) => backend().mediaLibrary.keep(data));

export const describeLibraryItem = createServerFn({ method: "POST" })
  .validator(checked(describeItemSchema))
  .handler(({ data }) => backend().mediaLibrary.describe(data));

export const moveLibraryItems = createServerFn({ method: "POST" })
  .validator(checked(moveItemsSchema))
  .handler(({ data }) => backend().mediaLibrary.move(data));

export const trashLibraryItem = createServerFn({ method: "POST" })
  .validator(checked(trashItemSchema))
  .handler(({ data }) => backend().mediaLibrary.trash(data));

export const cropLibraryItem = createServerFn({ method: "POST" })
  .validator(checked(cropItemSchema))
  .handler(({ data }) => backend().mediaLibrary.crop(data));
