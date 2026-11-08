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
- The page is Media library in the School section of the staff navigation
  (`/media`), for whoever manages the website. Teachers reach it only
  through the editor's chooser.

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

## What an item says

An item has its file's name and, apart from it, a title people call it by
(shown in place of the name wherever the library lists it), a description
for those who cannot see a picture, a caption a picture block starts its
caption from, and a credit. Title and caption live in
`core.media_item_texts`, one row per item; description and credit stay on
the file. Choosing a picture starts the block's alt text from the
description and its caption from the caption (`LibraryChoice`), and each
use may say them otherwise.

## Folders, tags, search and uses

- Folders nest. A folder is deleted only once empty, so nothing is lost with
  it. Items move between folders singly or several at a time.
- Tags are the school's own words (`core.media_tags`, unique per school
  whatever their case), and an item carries any number
  (`core.media_item_tags`, which names who tagged it and is kept as a
  school record on erasure). Typing a tag the school lacks makes it;
  taking a tag away keeps its items.
- Search looks in every folder by name, title, description and caption;
  the trash lists everything in it. Filters narrow by kind, by the month
  an item was added in the school's time zone, by who uploaded it and by
  tag (an item must carry every tag chosen); any of them searches every
  folder. All of it is kept in the page's address.
- In the grid and the list, items are selected together to download as
  one zip (`/v1/media/library.zip`), and, for the library's keepers, to tag,
  move or delete into the trash.
- Where an item is used is read from the documents that hold it, lessons,
  assignments, unit plans, notices, news, events, website pages and shared
  blocks, by title. Deleting an item in use names how many documents show
  it before it goes.

## Editing a picture

A picture is cropped in the browser to the original ratio, freeform, 1:1,
4:3, 3:2 or 16:9 (`cropRect` in the domain), turned a quarter at a time,
mirrored either way and narrowed to a width (`PictureEdits`), drawn on a
canvas and uploaded like any picture; `mediaLibrary.crop` keeps the upload
as a new item beside its original, in its folder, with its description,
credit and the people it shows, named for its shape or "edited", and
records the edits. The original never changes, so every document showing it
goes on showing it whole.

## Focal point

A keeper marks where a picture's subject sits (`mediaLibrary.focus`, kept
as `metadata.focus` in percent). A crop's frame starts on it, turned and
mirrored with the picture (`turnedFocus`); library tiles keep it in view;
and the website draws the picture around it wherever a page's own use of
the picture sets no focus of its own, in the builder from the file's facts
and on the published site from what the page published with it.

## Previews

What the media service makes of a file belongs to its bytes
(`core.file_previews`, by storage key), so every row sharing them, a copy
in a document or a previous version, shares them too; the sweep deletes
them once no file holds the bytes.

- **Pictures**: sizes 320 to 2400 wide in WebP and AVIF (`PICTURE_WIDTHS`),
  each only below the picture's own width, its width and height upright
  (also set on the file), and a ThumbHash placeholder. A reader, the
  editor, a gallery and the website builder draw a picture with a `srcset`
  of `/files/<id>?w=<width>` and a `sizes` from its block; the API sends the
  smallest size at least that wide in the best format the browser's
  `Accept` names, and the original when none is made. Library tiles ask for 320. The placeholder and the picture's shape come with the file's facts
  (`files.facts`), so it holds its place blurred until it loads.
- **Metadata**: the API removes location, camera and editing records from
  every picture (JPEG, PNG, WebP, GIF) before it keeps the upload anywhere,
  keeping only an orientation, which the media service then applies to the
  pixels in place. A picture a handed-in attempt holds is never rewritten.
- **Sound**: its length (on the file too) and a waveform of 100 bars,
  drawn as the player's timeline.
- **Documents**: a PDF's first page, drawn on the server, shows on its card
  and its library tile; an office file becomes a PDF, read in the viewer,
  where the service has LibreOffice, and is downloaded only otherwise.
- **Sealed files** (health reports, evidence, legal papers) get none, so
  nothing made of them sits in the store unsealed; their delivery is as
  before. Everything else made is served through the files host behind a
  sealed, short-lived link, as the file is.
- **The website** publishes a picture's sizes into the public folder of its
  copy, each a derivative of its publication, and keeps their names, the
  picture's size, placeholder and focal point in the published copy
  (`content.pictures`), so a visitor's browser picks a size from
  `<source>`s with no request to the API. A news post's cover is drawn the
  same way, on its page and on every card listing it. Sizes made after a
  page or post was published go up beside its public copy as the media
  service reports them (`publishLateSizes`), and the copies visitors read
  gain them then, without the page being published again.

Files stored before previews existed are cleaned and queued by the files
sweep, a few a school each pass.

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

## Uploading into it

Files are chosen, dropped on the page or pasted anywhere on it outside a
field, and go up through the design system's `UploadQueue` (one row each,
with progress, Stop, and Try again where it can help) into the open folder.
The editor and a website picture field take dropped and pasted files the
same way and show the same queue, as do a class's and module's files.

An upload survives a reload or a closed tab. The browser keeps each file
in IndexedDB (`apps/web/src/utils/upload-store.ts`) from the moment the
server gives it an id until it is put where it goes; when the page opens
again it asks the server which parts it holds (`GET /v1/files/:id/parts`,
which answers the parts held, or that the file is already in) and sends
only the rest, then places it. A Web Lock per upload keeps two tabs from
sending one file, and an upload older than the day the server keeps it is
forgotten. The editor finishes such an upload at the end of its document.

## Replacing a file

A keeper replaces an item's file with a new upload of the same kind: the
item keeps its id, so every document and page showing it shows the new
file at once (a website page's public copy changes when it is next
published), and the old file stays as a previous version for 30 days,
from which it can be brought back. It is `replaceFileBytes`, as class and
module files use.

## Uploads in documents

"In documents" lists what staff put straight into the documents they wrote
(news, notices, lessons, assignments, events, website pages) and the
library does not hold yet: one row per stored object, newest first, the
200 most recent looked through, and only those the viewer may open. A
student's work, a conversation's files and a recording still to be cut
never appear. Keeping one is `mediaLibrary.keep`, singly or several at
once.

## Bringing files in

- **From a link**: the server fetches it (`apps/api/src/files/fetch-link.ts`).
  Only http and https on the standard ports, without credentials; every
  address the host resolves to, and every redirect's, must be public, so
  loopback, private, carrier-grade NAT, link-local and metadata
  (169.254.169.254, fd00:ec2::254), multicast and reserved ranges, and
  IPv6 forms carrying one of those, are refused; the request is pinned to
  the address the check approved, so a second lookup cannot point it
  elsewhere. It stops at five redirects and at the limit an upload of the
  file's type has (`uploadLimit`): a video up to the school's video limit
  where the school has video, anything else the ordinary limit. It has 20
  seconds, or three minutes at a school with video. The bytes are set down
  on disk as they arrive, never held whole in memory, then go through the
  same quarantine, type check by content and scan as an upload
  (`takeUpload`), and land in the open folder.
- **Free pictures**: the open symbol and emoji collections the editor
  offers a question (ARASAAC, OpenMoji) are searched from the library page
  too; a picked one is copied into the school as an upload.
- **Wikimedia Commons**: a school that turns it on in Settings (the
  `commons_pictures` switch, off by default) lets its staff search Commons
  from the same sheet. Only someone signed in as staff who writes for
  others reaches the search (`library.pictures` with `collection:
  "commons"`); students and families never see it. The API asks Commons
  (`generator=search` over files, namespace 6, with `imageinfo` and its
  `extmetadata`) one request at a time with a gap between them, under a
  User-Agent naming the platform and the deployment's site, holds off as
  long as a `429` or `503` says, and keeps recent answers for ten minutes
  (`apps/api/src/library/commons.ts`). A picture under a non-commercial,
  no-derivatives or fair-use licence is left out, as it is when pasted.
  A picked one comes into the library with its description and its
  credit (author, licence and page), which every use then starts from.
  It is offered only where a picked picture keeps its credit, so a
  question's picture, which keeps none, does not offer it.

## Duplicates and storage

When an upload is checked, a file with the same SHA-256 and size that the
school already stores, placed and outside the trash, lends it its object:
the new row points at the same key and the copy just stored is removed
(`shareStoredObject`). Only files kept under the bucket's own encryption
share; a file sealed under the school's files key, or one behind a
special-category purpose, never shares bytes either way. An object goes
only when no active row points at it, which erasure now respects too.
Adding an item whose bytes the library already holds says so.

Storage is counted once per stored object. A video's streams (its
renditions, playlists, poster and thumbnails) count too, once per folder
of them, under the video's kind and its uploader: the media service
reports what a folder weighs when it finishes (`files.stream_bytes`, which
copies and versions carry with the file), and the files sweep weighs, a
few a pass, the folders of streams made before it did. Keepers see on the library page
the pool used against the plan's limit, by kind of file and by the ten
staff who uploaded most, with students, families and arriving mail counted
together (`mediaLibrary.storage`).

## What is recorded

Adding (by upload, link or keeping), renaming, describing (title,
description, caption or credit), moving, tagging, cropping, replacing,
deleting and restoring an item, and making, renaming and removing folders
and tags, each write an audit entry against the item, folder or tag.
