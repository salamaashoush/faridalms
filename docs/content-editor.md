# Shared LMS and CMS content

The LMS and CMS need one content system. Its editor, document validation,
static renderer and media authorization form the common boundary; each host
supplies the record context and available actions, including publication rules. A news post, an assignment brief,
a message and a school blog article must not each implement their own rich-text
engine. Lexical is the editor framework selected for this shared surface.

## Implementation

`packages/domain/src/content.ts` defines the serialized document boundary and
plain-text extraction. It checks node types and hierarchy, recursion, text size,
links and presentation styles before accepting content. The format follows
Lexical's serialized node model. JSON is canonical; HTML is a rendered output.
Besides text, headings, quotes, lists, checklists, links, code, tables and
dividers it accepts the editor's blocks: callouts, toggles, columns,
pictures, files, video and audio, embeds, drawings, questions, continue
gates, page breaks, a student's starting copy and a declaration of AI use,
and formulas written in LaTeX within the text. A question block is the one
model of a question everywhere one is asked, a family's forms included;
[systems/questions.md](systems/questions.md) describes it and the settings
each surface chooses.
`publishIssues` in `content-checks.ts` is the one list of what a document
must not carry to its readers: an undescribed picture, a skipped heading
level (or, for words under a heading of their own such as a website
section, a first-level heading), a vague link, a video without captions or
audio without captions or a transcript, and a suggested question not yet
kept. Every publishing path refuses those through `core/publication.ts`,
which also refuses a picture showing someone who has not agreed to it.

Lessons, quizzes, assignment briefs, learner responses, assessment
feedback, messages, announcements, calendar events, news posts, consent
forms and website sections all save the shared document; their readers
render it through the static renderer. Plain-text and Markdown messages
written by older clients keep their format and renderers. A news post or
announcement keeps one document per language, the translation checked as a
whole against the original. Documents keep their published versions, which
a writer can bring back, and lessons and briefs are written together live
through `apps/collab`.

Every document prints. A page that shows a document, to its writer or its
reader, offers Print through `components/print/usePrint.tsx`, which opens the
print preview: the pages exactly as they will print, laid out by the browser
page by page, beside their settings. Questions take their paper form, a page
break block (`pagebreak`, top level only, a dashed line in the editor and
nothing in the reader) turns the page, and teachers may add the answers in
place or as a key at the end. Lessons print for students from the blocks they
received, so no answer reaches their paper. How pages break is in
[the printing plan](plans/printing.md).

`packages/editor` is the editor, built on Lexical's extension API with stable
initialization: a fixed toolbar, one floating bar that adapts to what is
selected, a slash menu grouped by family and a block handle. A document
editor shows its words and reading time below the text, with an outline of
its headings and a focus mode (`Mod+Shift+\`, Escape to leave) that sets the
writing alone on the screen. Tables are sized on a grid as they are
inserted, fill from cells pasted out of a spreadsheet, and grow a row when
Tab leaves their last cell.
`apps/web/src/components/content/ContentEditor.tsx` hosts it with the
school's files and strings, and `ContentView.tsx` renders stored content
without loading the editing runtime.

## Comments while writing

Staff who may change a document comment on a passage or a whole block,
reply, mention a colleague with @, resolve and reopen a thread, and edit or
delete their own comments. Who may is the host's writer in
`files/authorize.ts`, the same check live editing and versions use, so
readers, students and families never see a comment and a colleague who
cannot change the document cannot either. A mention tells a colleague once,
as a mention notice that opens the thread in the record's editor.

Comments are never content. Threads live in `core.document_threads` and
`core.document_comments` beside the host's document, pointing into it by
block id and offset (`domain/anchors.ts`, shared with readers' comments on
handed-in work), so no version, print, export or reader ever carries them.
The editor marks open threads without writing into the document: words
through the CSS Custom Highlight API (`fe-comment`), a block commented as a
whole by a `data-fe-commented` attribute on its element
(`editor/comments.ts`, `plugins/comments.tsx`). Block ids travel with their
blocks through every edit, live ones included, so a passage is found again
for as long as its block survives; a thread whose words were deleted stays
listed as detached, with the passage it kept when it began.

A host turns comments on by giving `DocumentPage` a `comments` host naming
the editor they belong to and, where the page edits a translation too,
which part it shows. The page's top bar then offers the comments panel
(`components/content/comments/DocumentComments.tsx`), and that editor
offers Comment on its floating bar and its blocks' menu (Mod+Alt+M). Every
document page does so once its record is stored; the website studio, whose
page holds an editor per section, does not yet.
The renderer does not execute raw HTML or arbitrary CSS from stored records.
Older rich-text blocks convert through `content-conversion.ts` when
edited; the original representation remains readable. New rich content blocks
save the shared document.

Source inspected: the cloned Lexical repository at
`/tmp/faridalms-lexical-source`, including the extension React table example,
playground editor configuration, serialization implementations, editor composer,
and Markdown exports. The installed packages are aligned at 0.53.
Official references: [Lexical](https://lexical.dev/),
[serialization](https://lexical.dev/docs/serialization/serialization), and
[extensions](https://lexical.dev/docs/extensions/intro).

## Adding a block

1. Write its Lexical node in `packages/editor/src/nodes/` and list it in
   `blockNodes`.
2. Add its type to `contentNodeTypes` and its rule to `NODE_RULES` in
   `packages/domain/src/content.ts`: where it may stand (in running text, as
   a block, at the top only, or as a part of another node), what it must
   carry and hold, and how it reads as plain text. The build then fails until
   `content-html.ts` and the static renderer in `view.tsx` both draw it.
3. Give it a `BlockDefinition` in `blocks.ts`, a case in `$createStructure`
   when inserting it is more than turning a line into it, and its strings.

`packages/editor/src/registry.spec.ts` fails while the editor and the domain
disagree on the node types, and while any block, inserted at the top of a
document, in a callout or in a table cell, saves a document the domain
refuses.

## Remaining work

What the editor and the teaching tools on it still lack, with the order of
work, is in [plans/teaching-content.md](plans/teaching-content.md).
