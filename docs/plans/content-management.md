# Content management

The editor and the website studio are ahead of general-purpose CMSs on
teaching blocks, live editing and bilingual publishing, and behind them on
the ordinary tools of managing content: a media library and comments while
writing. This plan closes that gap. The comparison it comes from
read emdash (TipTap, Portable Text, Astro) at its 1.4 release.

Each slice lands on its own and deletes its entry here when it does.

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

## 6. Comments while writing

Staff who can edit a document comment on a passage or a block, reply,
mention a colleague and resolve the thread. Comments are never shown to the
document's readers and never print. They build on the anchors readers'
comments already use (`editor/anchors.ts`).
