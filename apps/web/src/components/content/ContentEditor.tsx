import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";
import type { EditorCollaboration, EditorMedia } from "@faridalms/editor";

import { contentPlainText } from "@faridalms/domain/content";
import { editorFrame } from "@faridalms/editor/view";
import { useHydrated } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useMemo, useState } from "react";

import { useEditorStudio } from "~/components/coding/useEditorStudio";
import { useEditorAssistant } from "~/components/content/assistant";
import { useEditorComments } from "~/components/content/comments/DocumentComments";
import { useEditorTools } from "~/components/content/lti";
import {
  useEditorMentions,
  useMentionNames,
} from "~/components/content/mentions";
import { useEditorBank } from "~/components/content/QuestionBank";
import { useEditorShared } from "~/components/content/SharedBlocks";
import { useEditorPuzzles } from "~/components/puzzles/useEditorPuzzles";
import { useEditorStandards } from "~/components/standards/editor";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { digits } from "~/utils/digits";

import { ContentView } from "./ContentView";
import { editorStrings } from "./strings";

const loadEditor = () => import("@faridalms/editor/Editor");
const Editor = lazy(loadEditor);

// The editor's code is fetched as soon as a page that writes documents loads,
// alongside the rest of its script, rather than once that page has hydrated.
if (typeof window !== "undefined") void loadEditor();

export interface ContentEditorProps {
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
  replace?: { to: ContentDocument; at: number; quiet?: boolean };
  onUploadingChange?: (uploading: boolean) => void;
  questions?: boolean;
  /** A family's form: it asks only a form's questions, which mark nothing. */
  forms?: boolean;
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
  /** Young children read it, so its page is set as they will see it. */
  young?: boolean;
  /** Offers the school's language model on the lesson or brief this page edits. */
  assistant?: boolean;
}

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
  forms,
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
  young,
  assistant = false,
}: ContentEditorProps) {
  const strings = useMemo(() => editorStrings(), []);
  const hydrated = useHydrated();
  // A form asks only what a family answers in words, a choice or a number.
  const teaching = Boolean(questions) && !forms;
  const coding = useEditorStudio(teaching ? media : undefined);
  const designing = useEditorPuzzles(teaching);
  const banking = useEditorBank(teaching);
  const tagging = useEditorStandards(teaching || standards);
  const sharing = useEditorShared(sharedBlocks ?? (teaching || standards));
  const mentions = useEditorMentions(useMentionNames(value));
  const tools = useEditorTools();
  const comments = useEditorComments(id);
  const helping = useEditorAssistant(assistant);
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
  const room = collaboration?.id;
  const onSynced = useCallback(() => {
    if (room) setJoined(room);
  }, [room]);
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
          comments={comments}
          assistant={helping}
          placeholder={placeholder}
          initialFocus={initialFocus}
          strings={strings}
          collaboration={collaboration}
          digits={digits()}
          replace={replace}
          onUploadingChange={onUploadingChange}
          questions={questions}
          forms={forms}
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
          young={young}
          onSynced={collaboration ? onSynced : undefined}
        />
      </div>
      {coding.dialog}
      {designing.dialog}
      {banking.dialog}
      {sharing.dialog}
    </Suspense>
  );
}
