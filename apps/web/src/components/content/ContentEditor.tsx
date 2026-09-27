import type { ContentDocument } from "@faridalms/domain/content";
import type { EditorCollaboration, EditorMedia } from "@faridalms/editor";

import { useHydrated } from "@tanstack/react-router";
import { lazy, Suspense, useMemo } from "react";

import { cn } from "~/utils/cn";

import { editorStrings } from "./strings";

const Editor = lazy(() => import("@faridalms/editor/Editor"));

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
}) {
  const strings = useMemo(() => editorStrings(), []);
  const hydrated = useHydrated();
  const placeholderBox = (
    <div
      aria-busy="true"
      className={cn(
        "animate-pulse",
        variant === "document"
          ? "min-h-[40vh]"
          : "min-h-48 rounded-xl border bg-muted/20",
      )}
    />
  );
  // Lexical needs a DOM, so the server sends the placeholder and the editor
  // starts in the browser.
  if (!hydrated) return placeholderBox;
  return (
    <Suspense fallback={placeholderBox}>
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
        placeholder={placeholder}
        initialFocus={initialFocus}
        strings={strings}
        collaboration={collaboration}
      />
    </Suspense>
  );
}
