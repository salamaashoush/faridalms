# Content management

The editor and the website studio are ahead of general-purpose CMSs on
teaching blocks, live editing and bilingual publishing, and behind them on
the ordinary tools of managing content: a media library, page SEO, locking a
document one person is editing, comments while writing, and the comfort of
the editor itself. This plan closes that gap. The comparison it comes from
read emdash (TipTap, Portable Text, Astro) at its 1.4 release.

Each slice lands on its own and deletes its entry here when it does.

## 2. Tables

Inserting a table asks for its size on a grid, as a word processor does. A
table's own menu, on the table and on a selected cell, adds and removes rows
and columns before or after, turns a header row or column on and off, merges
and splits cells and deletes the table. Columns resize by dragging their edge,
and pasting into a table keeps its shape.

## 3. Writing comfort

A word count and reading time, an outline of the document's headings that
jumps to each, and a focus mode that hides everything but the words.

## 4. Media library

A school's pictures, video and files, uploaded once and chosen again from any
document or website section. It is a files area (`files/authorize.ts`
`registerArea`), not a new store, and uses one picture shape for the editor
and the website.

- Folders, search, and where each item is used.
- A picture keeps its description, credit and who it shows; a use may
  override the description.
- Crop to a ratio, kept as a new derivative so the original stays.
- The editor's picture and file blocks and the website's picture fields
  choose from it as well as uploading.

## 5. Editing one at a time

Documents not written live (news, announcements, events, consents, website
pages) are held by whoever opens them to edit. Anyone else opening one sees
who holds it, reads it, and may take it over; the holder is told and their
next save is refused. A save that is still refused as stale opens a screen
that compares the two versions and keeps one.

## 6. Comments while writing

Staff who can edit a document comment on a passage or a block, reply,
mention a colleague and resolve the thread. Comments are never shown to the
document's readers and never print. They build on the anchors readers'
comments already use (`editor/anchors.ts`).

## 7. Website SEO

Each page carries a social picture, a "keep out of search" switch and a
canonical address. The site publishes `sitemap.xml`, `robots.txt` and the
`hreflang` alternates of its two languages, keeps redirects from old
addresses, and names the school's own social accounts rather than a fixed
one.
