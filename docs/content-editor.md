# Shared LMS and CMS content

The LMS and CMS need one content system. Its editor, document validation,
static renderer and media authorization form the common boundary; each host
supplies the record context and available actions, including publication rules. An announcement, an assignment brief,
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
Who a picture shows is named from the floating bar, on a picture of its
own and on each picture of a gallery alike (its bar's "Who is in it"
lists them), so the check reaches every picture a document holds.

Lessons, quizzes, assignment briefs, learner responses, messages,
discussion posts, announcements, calendar events, consent forms and website
sections all save the shared document; their readers render it through the
static renderer. Talk about a document is plain text by design: comments on
a passage (a writer's comments, and a marker's comments on handed-in work),
their replies, and the feedback a marker writes beside a mark, each at most
a few thousand characters, so marking stays a matter of typing. Plain-text and Markdown messages
written by older clients keep their format and renderers. An announcement
keeps one document per language, the translation checked as a
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

## Help from a language model

A school may let its teachers ask a language model for help with what
they write, off until an administrator turns it on in Settings, Language
model (`school:manage`), choosing the provider among those the deployment
holds a key for and a daily limit for the whole school. Anthropic is the
first provider (`ANTHROPIC_API_KEY`, `ASSISTANT_MODEL`, by default
`claude-opus-5-5`); each sits behind `AssistantProvider` in
`apps/api/src/assistant/provider.ts`, so another is one adapter. Keys are
the deployment's and never reach a school.

The editor of lessons and briefs offers it once the record is stored:
"Suggest questions" in the insert menu and "Writing help" on the floating
bar open one panel (`plugins/assistant.tsx`, through the host's
`EditorAssistant`). Suggested questions come back as blocks of the existing
kinds, each shown with its answers to add or dismiss one by one; a level
rewrite of the selected paragraphs is shown as it is written, to replace
the text or discard. Nothing enters the document without the teacher's
click. "Draft the translation" in a lesson's or brief's translation section
fills the translation being written; a translation the model drafted is
withheld from readers (a lesson cannot be published, a brief's readers get
the original) until a person checks it against the original.

The server alone decides what leaves (`apps/api/src/assistant/routes.ts`):
staff only, a record the person may write, never a document holding a
student's work, within the school's day. The prompt is built from the
teacher's own words (`teacherWords` and `translationUnits` in
`domain/assistant.ts`): mentions, answer keys, gaps, code, formulas,
files, pictures and embeds are left out, and the school's students' full
names are replaced by tokens the answer has put back. Every request is
recorded in `core.assistant_requests` (who, which record, what kind, how
much was sent and came back, the model) and audited; the words are never
kept. Answers stream to the panel and stop when it closes. Requests are
paced from Anthropic's `anthropic-ratelimit-*` headers and `retry-after`,
never a guessed interval.

## Keeping a key press cheap

Teachers write lessons of several hundred blocks on school Chromebooks, so
the work a key press does must not grow with the document:

- Nothing that runs on every update walks the whole document. Lexical runs
  the root's transform at the end of every update; the block, answer and
  link id passes there wait for a node to join the document. Update
  listeners revisit the nodes the update marked dirty (`dirtyElements`,
  `dirtyLeaves`), and an update that only moved the selection changes no
  marks.
- Layout is read in the animation frame that draws a change, once, never
  inside an update listener, and a measured position is set as state only
  when it moved (`plugins/Table.tsx`, `plugins/code-block.tsx`).
- The host is handed the document in a task of its own, validated, and
  draws it as a React transition: the first change after a quiet second
  once its letter is drawn, the rest of a burst when typing pauses (200ms,
  at most a second in); blur, Escape and shortcuts hand it over at once. The surface
  and its plugins are memoised against the host's redraw, and the word
  count is a store only the footer reads.
- Undo keeps the last 200 steps (`UNDO_STEPS` in `Editor.tsx`). Each step
  holds a copy of the document's node map, so Lexical's unbounded default
  grew a long lesson's editor by megabytes a minute.

`apps/web/src/components/content/editor-performance.spec.tsx` holds the
budget, on the 336-block lesson in `packages/editor/src/large-document.ts`:
a key in it may cost at most two and a half times a key in a 24-block one,
typing draws nothing in React, and the host hears of it once, after the
pause. A walk of the document on each key fails the first. In Chromium with
the CPU slowed fourfold, a key in that lesson reaches the screen in about
15ms (170ms before the budget existed).

## Remaining work

What the editor and the teaching tools on it still lack, with the order of
work, is in [plans/teaching-content.md](plans/teaching-content.md).
