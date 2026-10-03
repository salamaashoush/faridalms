import type { ContentDocument } from "@faridalms/domain/content";
import type { EditorCollaboration, EditorMedia } from "@faridalms/editor";

import { contentPlainText } from "@faridalms/domain/content";
import { editorFrame } from "@faridalms/editor/view";
import { useHydrated } from "@tanstack/react-router";
import { lazy, Suspense, useMemo, useState } from "react";

import { useEditorStudio } from "~/components/coding/useEditorStudio";

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
  lockQuestions,
  starter,
  aiUse,
  narration,
  lessonActivities,
  pending = false,
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
  lockQuestions?: boolean;
  starter?: boolean;
  aiUse?: boolean;
  narration?: boolean;
  lessonActivities?: boolean;
  /** Whether the document may be live is still being asked. */
  pending?: boolean;
}) {
  const strings = useMemo(() => editorStrings(), []);
  const hydrated = useHydrated();
  const coding = useEditorStudio(questions ? media : undefined);
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
          placeholder={placeholder}
          initialFocus={initialFocus}
          strings={strings}
          collaboration={collaboration}
          replace={replace}
          onUploadingChange={onUploadingChange}
          questions={questions}
          gates={gates}
          lockQuestions={lockQuestions}
          starter={starter}
          aiUse={aiUse}
          narration={narration}
          lessonActivities={lessonActivities}
          onSynced={
            collaboration ? () => setJoined(collaboration.id) : undefined
          }
        />
      </div>
      {coding.dialog}
    </Suspense>
  );
}
