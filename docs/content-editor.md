# Shared LMS and CMS content

The LMS and CMS need one content system. Its editor, document validation,
static renderer and media authorization form the common boundary; each host
supplies the record context and available actions, including publication rules. A newsletter layout, an assignment brief,
a message and a school blog article must not each implement their own rich-text
engine. Lexical is the editor framework selected for this shared surface.

## Implementation

`packages/domain/src/content.ts` defines the serialized document boundary and
plain-text extraction. It checks node types and hierarchy, recursion, text size,
links and presentation styles before accepting content. The format follows
Lexical's serialized node model. JSON is canonical; HTML is a rendered output.
The current boundary accepts text, headings, quotes, lists, checklists, links,
code, tables and dividers. Media nodes need the asset service before acceptance.

`apps/web/src/components/content/ContentEditor.tsx` uses Lexical's extension API
with stable initialization. `ContentToolbar.tsx` supplies the shared controls.
`ContentView.tsx` renders stored content without loading the editing runtime.
The renderer does not execute raw HTML or arbitrary CSS from stored records.
Existing newsletter text blocks convert through `content-conversion.ts` when
edited; the original representation remains readable. New rich content blocks
save the shared document. Other authoring surfaces are not connected yet.

Source inspected: the cloned Lexical repository at
`/tmp/faridalms-lexical-source`, including the extension React table example,
playground editor configuration, serialization implementations, editor composer,
and Markdown exports. The installed packages are aligned at 0.50.0.
Official references: [Lexical](https://lexical.dev/),
[serialization](https://lexical.dev/docs/serialization/serialization), and
[extensions](https://lexical.dev/docs/extensions/intro).

## Required remaining work

- Integrate the shared editor and renderer into messages, event descriptions,
  assignment briefs and announcements, preserving existing Markdown/plain-text
  records and their API clients. Blog authoring follows the LMS integrations.
- Provide contextual editor controls without changing the document format:
  recipient and notification choices for messages, audience and publication for
  newsletters, deadlines and assessment settings for assignments.
- Build school-scoped private assets, upload lifecycle, downloads, image sizing,
  captions, alternative text, file attachments and authorized media rendering.
  Embed providers need explicit allowlists and privacy controls.
- Add font and color controls, clear formatting, slash commands, block movement,
  table resizing/merging, reliable link editing, search/replace and templates.
- Add document revisions, autosave, conflict comparison, reusable content blocks,
  scheduled publication, immutable editions and audit events.
- Add collaboration and comments with an explicit school/record authorization
  boundary, reconnection semantics and concurrent editing tests.
- Provide email output, print/export and Markdown conversion with clear handling
  of constructs the destination cannot represent. Never silently replace a rich
  document with a lossy export.
- Verify every supported node through editor creation, keyboard operation,
  serialization, API validation, save/reload, static rendering, Arabic RTL and
  mobile layouts. This includes pasted external content and invalid documents.

The current controls and regression tests are an integration checkpoint. They do
not establish completion of this editor or the wider LMS/CMS.
