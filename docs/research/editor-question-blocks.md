# Question blocks in the editor: node architecture

Written 2026-10-01 for the plan's block widget framework
([../plans/documents-editor-modules.md](../plans/documents-editor-modules.md)
section 3, item 1). Read against Lexical v0.50.0, the version the repository
uses; Lexical paths are relative to `packages/` at
https://github.com/facebook/lexical/blob/v0.50.0/packages/.

## Conclusion

Questions with typed parts are **ElementNode trees** like the existing
`ToggleNode`, with their settings in **NodeState**. Gaps are **inline
DecoratorNodes**, and only widgets with no text of their own (the continue
gate) are **DecoratorBlockNodes**. The server turns node JSON back into
today's `LessonBlock` objects, so `markResponse` and `studentBlocks` keep
working unchanged. Nested editors are ruled out; named slots are promising
but still experimental. This changes the plan's "decorator-node base".

## What Lexical offers

**DecoratorNode with React inputs** (playground `PollNode`, and our media
captions). The options array is one NodeState key edited in `<input>`s
(`lexical-playground/src/nodes/PollNode.tsx:88-104`). In collaboration each
NodeState key is set whole (`lexical-yjs/src/Utils.ts:623-668`), so two
teachers editing different options overwrite each other, a remote update
replaces an input while someone types in it, no collaborator cursor shows,
and while focus is in an input Lexical's selection stays where it was
(`lexical/src/LexicalUtils.ts:203`), so the floating bar cannot tell which
option is being edited.

**ElementNode trees.** Text sits in Y.XmlText and merges per character;
copy, paste, carets and the format bar work with nothing extra. Remote
updates apply with `skipTransforms: true`
(`lexical-yjs/src/SyncEditorStates.ts:234`), so a merge can leave a broken
shape until a client's next local edit; the root transform, which runs last on
every update (`lexical/src/LexicalUpdates.ts:358-364`), is where shapes are
repaired and ids assigned.

**Nested editors** (ImageNode caption, StickyNode). Each is a Yjs subdocument
(`lexical-yjs/src/Utils.ts:705-716`), Hocuspocus does not support
subdocuments (https://tiptap.dev/docs/hocuspocus/guides/multi-subdocuments,
https://github.com/facebook/lexical/issues/6065), and our collab server binds
only `"root"` (`apps/collab/src/server.ts:66-72`), so derived JSON would lose
nested content silently. Rejected.

**Named slots** (v0.46, breaking change in 0.50, `@experimental`):
`$setSlot`/`$getSlot` (`lexical/src/LexicalSlot.ts:249, :464`), synced through
a `__slots` Y.Map. Slots are a fixed set of names, so an options list still
needs children, and slot values have no parent, which breaks our
`$nearestBlock`, `$isBlockContainer` and `$currentBlock`. Revisit for fixed
regions (prompt, hint, explanation) once stable.

**NodeState** leaves values equal to the default out of JSON
(`lexical/src/LexicalNodeState.ts:707-725`), so the server parser applies the
same defaults; unknown keys survive round trips, so stripping keys for
students must be an allowlist. **Copy and paste** carry `$` state, ids
included (`lexical-clipboard/src/clipboard.ts:637`); the hook to fix them is
`SELECTION_INSERT_CLIPBOARD_NODES_COMMAND`.

Other block editors agree: ProseMirror models a question as
`question: "prompt option{2,8}"` with `{id, correct}` attributes, BlockNote as
child blocks with props, Plate as nested elements, Notion as child blocks
(https://www.notion.com/blog/data-model-behind-notion). Editable sub-parts are
child nodes in the shared tree; flags and settings are attributes.

## Design for Farida

**Nodes.** `QuestionNode` (ElementNode, shadow root so a paste cannot split
it, not a block container so the block handle drags it whole) holding a
`QuestionPromptNode` (inline content, like `ToggleTitleNode`) and the parts
of its kind: `OptionNode*` (choice, ordering), `AnswerNode*` (typed text),
`PairNode` with prompt and answer (matching), `GroupNode` with a title and
`ItemNode*` (sorting), `PassageNode` with paragraphs holding `GapNode`s
(gaps); optional `HintNode` and `ExplanationNode`. Transforms modelled on
`ToggleNode` repair broken shapes and enforce the option cap. `GateNode` is a
DecoratorBlockNode selected on click, like media.

**Settings in NodeState**, each its own key: points, tries, multiple,
shuffle, caseSensitive, closeEnough, tehMarbuta, number mode and tolerance,
word limit, scoring; `correct` and `feedback` on options, `groupId` on items.

**Correct marker** follows the checklist edge-click pattern
(`lexical-list/src/checkList.ts:350-396`, our `toggle.ts:142-152`):
`data-correct` and `aria-checked` from `createDOM`, toggled by a click at the
inline-start edge, drawn the same way by `view.tsx`.

**The one floating bar** gains a `question` mode (`SelectionToolbar.tsx`
`refresh()`), shown for a caret inside a question or a selected question or
gate, with the kind's controls (points, tries, multiple, shuffle, the current
option's correct flag and feedback, add hint or explanation). A selected gap
gets a `gap` mode. Text selections keep the format mode.

**Keyboard.** Enter in the prompt moves to the first part; in an option adds
one; in an empty last option removes it and leaves the question. Backspace at
the start of an empty option removes it; at the first option moves into the
prompt; at the prompt's start selects the whole question. Escape selects the
question, Mod+Enter toggles correct, Mod+D duplicates.

**Gaps** are inline atomic chips with `$.id`, answers and choices, typed with
today's `[a/b]` syntax through a text transform reusing `parseGaps`, allowed
only inside a gaps passage.

**Ids.** Answers reference question ids as UUIDs (`learning.ts:35`,
`block_id::uuid`). Two traps: `blockIdState`'s parser
(`packages/editor/src/nodes/index.ts:37-40`) rejects hyphens, so imported
UUIDs would be replaced and every answer cut loose; and `$assignBlockIds`
keeps the first id in document order, so a copy pasted above its original
takes the original's id. Widen the parser, mint `crypto.randomUUID()` for
questions and parts, keep the id on the node that existed in the committed
state, and have the server reject duplicate ids, since remote merges skip
transforms.

**Server.** `lessonQuestions(document)` in domain walks the JSON into
`LessonBlock`s, applying NodeState defaults; marking and scoring are reused.
`studentDocument(document, seed)` rebuilds questions from an allowlist (type,
id, prompt and part text, gap ids and choices) and drops hints, explanations,
answers, `correct` and feedback, shuffling with the existing `shuffled`.
Students never get a collaboration ticket for a lesson, since the Y.Doc holds
the keys. `contentPlainText` skips hint, explanation and answer nodes.

**Schema.** `contentDocumentSchema` stays permissive about question
internals: when validation fails the collab server stores the ydoc but never
updates the derived JSON (`apps/collab/src/server.ts:134-145`), so one
half-merged question would freeze the document. Completeness (two options, a
right answer) is checked at publish, with the issues shown in the editor.

**Migration.** `lessonToDocument` is the inverse of `lessonQuestions`:
content blocks spliced in place, media to `MediaNode`, gate to `GateNode`,
each question to a `QuestionNode` keeping its id and its option, gap, pair,
item and group ids. A round-trip test over the nine kinds must be the
identity, and the collab bootstrap must keep every id.
