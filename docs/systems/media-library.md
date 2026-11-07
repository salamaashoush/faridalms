# Media library

A school's pictures, video and files, uploaded once and chosen again in any
document or website page. It is a file area of the school, registered with
`registerArea` in `apps/api/src/systems/media-library.ts`, not a store of its
own: its items are rows of `core.files` hosted by `media_library` and the
school's id, sharing the trash, the sweep and the storage counts of every
other file.

## Who uses it

- Whoever writes for others (`LIBRARY_USERS` in
  `packages/domain/src/media-library.ts`: assignments, lessons, events,
  notices, news and the website) reads all of it, chooses from it, uploads
  into it and crops a picture into a new item.
- Those who put pictures in front of others, news and the website
  (`LIBRARY_KEEPERS`), also keep it: folders, an item's name, description
  and credit, who a picture shows, moving items and the trash.
- The page is Media library under the admin portal's School section
  (`/admin/media`). Teachers reach it only through the editor's chooser.

## Showing an item in a document

A document shows a library item where it is. `placeMedia`
(`apps/api/src/files/authorize.ts`) copies a file from another record into
the document's own keeping, so a document never opens up files it only
shows; an area registered `linked` is the exception. Its file stays in the
library, the document's `document_files` row records the use, and
`canReadFile` opens an area's file to whoever may read a document showing
it. So a family reading a brief reads the library picture in it and nothing
else of the library, a change to the item shows in every document at once,
and the library can say where each item is used.

- An item in the trash cannot be put in a new document, and stays in any
  document that already showed it, which shows it as removed until it is
  restored.
- The sweep that retires media a document dropped leaves library items
  alone; only the trash, after 30 days, retires them.
- A website page publishes a library picture as it publishes any other:
  `publishMedia` copies it to the public bucket and checks that everyone it
  shows may appear on the website.

## One picture shape

Every surface keeps a picture as `Picture` in `packages/domain/src/commons.ts`:
the file, its description for those who cannot see it unless it only
decorates, its credit, and its focal point. An item keeps a description and
a credit of its own (`files.description`, `files.credit`); choosing it
starts a use from those words, and the use may say it otherwise without
changing the item. Who a picture shows is the file's own
(`core.file_subjects`), so it holds wherever the item is shown.

## Folders, search and uses

- Folders nest. A folder is deleted only once empty, so nothing is lost with
  it. Items move between folders singly or several at a time.
- Search looks in every folder by name and description; the trash lists
  everything in it.
- Where an item is used is read from the documents that hold it, lessons,
  assignments, unit plans, notices, news, events, website pages and shared
  blocks, by title. Deleting an item in use names how many documents show
  it before it goes.

## Cropping

A picture is cropped in the browser to the original ratio, freeform, 1:1,
4:3, 3:2 or 16:9 (`cropRect` in the domain), drawn on a canvas and uploaded
like any picture; `mediaLibrary.crop` keeps the upload as a new item beside
its original, in its folder, with its description, credit and the people it
shows, named for its shape. The original never changes, so every document
showing it goes on showing it whole.

## Choosing

`EditorMedia.library` (`packages/editor/src/context.tsx`) is the editor's
way in, supplied by `MediaLibraryProvider` for those who may use it.

- Inserting a picture, video or file block opens the chooser, with the
  device's own files beside the library's.
- A gallery adds pictures from the library beside its upload.
- A selected picture's bar keeps it in the library too, with the words the
  document gives it (`mediaLibrary.keep`), as a library record of its own
  sharing the bytes.
- The website studio's picture and media fields and a news post's cover
  choose from it beside their upload.
