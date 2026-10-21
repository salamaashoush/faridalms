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
gates, page breaks, a student's starting copy and a declaration of AI use.
`content-checks.ts` names what a document must not carry to its readers
(an undescribed picture, a first-level heading, a skipped level, a vague
link), and every publishing path refuses those.

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
selected, a slash menu grouped by family and a block handle.
`apps/web/src/components/content/ContentEditor.tsx` hosts it with the
school's files and strings, and `ContentView.tsx` renders stored content
without loading the editing runtime.
The renderer does not execute raw HTML or arbitrary CSS from stored records.
Older rich-text blocks convert through `content-conversion.ts` when
edited; the original representation remains readable. New rich content blocks
save the shared document.

Source inspected: the cloned Lexical repository at
`/tmp/faridalms-lexical-source`, including the extension React table example,
playground editor configuration, serialization implementations, editor composer,
and Markdown exports. The installed packages are aligned at 0.50.0.
Official references: [Lexical](https://lexical.dev/),
[serialization](https://lexical.dev/docs/serialization/serialization), and
[extensions](https://lexical.dev/docs/extensions/intro).

## Remaining work

What the editor and the teaching tools on it still lack, with the order of
work, is in [plans/teaching-content.md](plans/teaching-content.md).
