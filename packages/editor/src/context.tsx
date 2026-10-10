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
  /** The part of a recording to keep, in milliseconds from its start. */
  trim?: { startMs: number; endMs: number };
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
  /**
   * Who a picture shows, where it matters who appears: the host names the
   * students and checks their families agreed. The bar offers it on a
   * selected picture.
   */
  people?: (fileId: string) => void;
  /**
   * Whether a recording's ends can be cut off before it is kept, which
   * takes the school's media service to do.
   */
  canTrim?: () => Promise<boolean>;
  /** Captions drafted from what a recording says, where the school's media service can. */
  captions?: {
    draft: (fileId: string, language: "ar" | "en") => Promise<void>;
    status: (fileId: string) => Promise<CaptionDraftStatus>;
  };
}

/** Whether captions can be drafted, and how a recording's draft is getting on. */
export interface CaptionDraftStatus {
  available: boolean;
  draft: {
    state: "queued" | "working" | "ready" | "failed";
    progress: number | null;
    vtt: string | null;
  } | null;
}

/**
 * The coding studio, where a teacher builds a coding question's starter
 * project. `edit` resolves to the saved project's file, null for none, or
 * undefined when the teacher closed the studio without saving.
 */
export interface EditorStudio {
  edit: (fileId: string | null) => Promise<string | null | undefined>;
}

export interface EditorEnvironment {
  strings: EditorStrings;
  media?: EditorMedia;
  /** Offers coding questions; absent where no studio is set up. */
  studio?: EditorStudio;
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
