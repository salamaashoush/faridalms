import { createContext, useContext } from "react";

import type { EditorStrings } from "./strings";

export interface UploadedFile {
  fileId: string;
  name: string;
  mime: string;
  bytes: number;
}

export type UploadKind =
  | "image"
  | "file"
  | "media"
  | "captions"
  | "diagram"
  | "scene";

export interface UploadOptions {
  signal?: AbortSignal;
  /** How much has been sent, from 0 to 1. */
  onProgress?: (progress: number) => void;
}

/** An open picture a teacher may copy into the school. */
export interface LibraryPicture {
  source: string;
  id: string;
  label: string;
  thumb: string;
  full: string;
}

export interface EditorMedia {
  /** Stores a file; a refusal rejects with the server's code as the message. */
  upload: (
    file: File,
    kind: UploadKind,
    options?: UploadOptions,
  ) => Promise<UploadedFile>;
  url: (fileId: string) => string;
  accept: Record<"image" | "file" | "media" | "captions", string[]>;
  /** Open pictures found by what they show, with the credit their makers ask for. */
  pictures?: {
    search: (query: string) => Promise<LibraryPicture[]>;
    credits: string;
  };
}

export interface EditorEnvironment {
  strings: EditorStrings;
  media?: EditorMedia;
  locale: string;
  /** The document may ask questions, as a lesson or quiz does. */
  questions?: boolean;
  /** The document may stop at continue gates. */
  gates?: boolean;
  /** Questions are shown but kept from change. */
  lockQuestions?: boolean;
  /** Part of the document may be set aside as each student's copy. */
  starter?: boolean;
  /** A student's work may acknowledge using an AI tool. */
  aiUse?: boolean;
  /** Blocks and question parts may carry a recording that reads them aloud. */
  narration?: boolean;
  /**
   * Activities only a lesson offers: written questions answered by speaking,
   * and counting.
   */
  lessonActivities?: boolean;
}

const Context = createContext<EditorEnvironment | null>(null);

export const EditorEnvironmentProvider = Context.Provider;

export function useEditorEnvironment(): EditorEnvironment {
  const value = useContext(Context);
  if (!value) throw new Error("Editor environment is missing");
  return value;
}
