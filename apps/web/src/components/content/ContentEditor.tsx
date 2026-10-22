import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";
import type { EditorCollaboration, EditorMedia } from "@faridalms/editor";

import { contentPlainText } from "@faridalms/domain/content";
import { editorFrame } from "@faridalms/editor/view";
import { useHydrated } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";

import { useEditorStudio } from "~/components/coding/useEditorStudio";
import { useEditorTools } from "~/components/content/lti";
import { useEditorMentions } from "~/components/content/mentions";
import { useEditorBank } from "~/components/content/QuestionBank";
import { useEditorShared } from "~/components/content/SharedBlocks";
import { useEditorPuzzles } from "~/components/puzzles/useEditorPuzzles";
import { useEditorStandards } from "~/components/standards/editor";
import { useCurrentUser } from "~/hooks/useCurrentUser";

import { ContentView } from "./ContentView";
import { editorStrings } from "./strings";

const loadEditor = () => import("@faridalms/editor/Editor");
const Editor = lazy(loadEditor);

// The editor's code is fetched as soon as a page that writes documents loads,
// alongside the rest of its script, rather than once that page has hydrated.
if (typeof window !== "undefined") void loadEditor();

export function ContentEditor({
  id,
  label,
  value,
  onChange,
  onValidityChange,
  disabled = false,
  variant = "field",
  toolbar = true,
  media,
  placeholder,
  initialFocus,
  collaboration,
  replace,
  onUploadingChange,
  questions,
  gates,
  draws,
  lockQuestions,
  starter,
  aiUse,
  narration,
  lessonActivities,
  feedbackTiming,
  standards = false,
  sharedBlocks,
  pending = false,
  language,
}: {
  id: string;
  label: string;
  value: ContentDocument;
  onChange: (value: ContentDocument) => void;
  onValidityChange?: (valid: boolean) => void;
  disabled?: boolean;
  variant?: "document" | "field";
  toolbar?: boolean;
  media?: EditorMedia;
  placeholder?: string;
  initialFocus?: boolean;
  collaboration?: EditorCollaboration;
  replace?: { to: ContentDocument; at: number };
  onUploadingChange?: (uploading: boolean) => void;
  questions?: boolean;
  gates?: boolean;
  draws?: boolean;
  lockQuestions?: boolean;
  starter?: boolean;
  aiUse?: boolean;
  narration?: boolean;
  lessonActivities?: boolean;
  /** Questions may keep how they went until the end or the teacher's word. */
  feedbackTiming?: boolean;
  /** The language the document teaches in; without it, read from its words. */
  language?: ContentLocale;
  /** Standards blocks may name the school's standards, as a unit plan's do. */
  standards?: boolean;
  /** Whether it shows blocks kept once for many documents; teaching documents do. */
  sharedBlocks?: boolean;
  /** Whether the document may be live is still being asked. */
  pending?: boolean;
}) {
  const strings = useMemo(() => editorStrings(), []);
  const hydrated = useHydrated();
  const coding = useEditorStudio(questions ? media : undefined);
  const designing = useEditorPuzzles(Boolean(questions));
  const banking = useEditorBank(Boolean(questions));
  const tagging = useEditorStandards(Boolean(questions) || standards);
  const sharing = useEditorShared(
    sharedBlocks ?? (Boolean(questions) || standards),
  );
  const mentions = useEditorMentions();
  const tools = useEditorTools();
  const { arabicMath } = useCurrentUser().school;
  const document = variant === "document";
  // Lexical needs a DOM, so the server draws the document in the editor's own
  // frame and the editor takes that frame over in the browser.
  const placeholderBox = (
    <div aria-busy="true" className={editorFrame.surface(document)}>
      {toolbar && !disabled ? (
        <div className={editorFrame.toolbar(document)}>
          <div className="h-10 bg-muted/25" />
        </div>
      ) : null}
      <ContentView
        document={value}
        className={editorFrame.content(document).replace(/^fe /, "")}
      />
      {document ? null : (
        <div className={editorFrame.footer(document)}>
          <span>{strings.placeholder}</span>
          <span>{strings.characters(contentPlainText(value).length)}</span>
        </div>
      )}
    </div>
  );
  // A live editor starts empty and fills from its room, so the stored text
  // stays in its place until the room's copy is drawn.
  const [joined, setJoined] = useState<string | null>(null);
  const waiting = collaboration !== undefined && joined !== collaboration.id;
  if (!hydrated || pending) return placeholderBox;
  return (
    <Suspense fallback={placeholderBox}>
      {waiting ? placeholderBox : null}
      <div className={waiting ? "hidden" : "contents"}>
        <Editor
          id={id}
          label={label}
          value={value}
          onChange={onChange}
          onValidityChange={onValidityChange}
          disabled={disabled}
          variant={variant}
          toolbar={toolbar}
          media={media}
          studio={coding.studio}
          puzzles={designing.puzzles}
          bank={banking.bank}
          standards={tagging}
          shared={sharing.shared}
          mentions={mentions}
          tools={tools}
          placeholder={placeholder}
          initialFocus={initialFocus}
          strings={strings}
          collaboration={collaboration}
          replace={replace}
          onUploadingChange={onUploadingChange}
          questions={questions}
          gates={gates}
          draws={draws}
          lockQuestions={lockQuestions}
          starter={starter}
          aiUse={aiUse}
          narration={narration}
          lessonActivities={lessonActivities}
          feedbackTiming={feedbackTiming}
          arabicMath={arabicMath}
          language={language}
          onSynced={
            collaboration ? () => setJoined(collaboration.id) : undefined
          }
        />
      </div>
      {coding.dialog}
      {designing.dialog}
      {banking.dialog}
      {sharing.dialog}
    </Suspense>
  );
}
