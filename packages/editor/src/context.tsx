import type { ContentDocument, Mention } from "@faridalms/domain/content";
import type { SpeechLanguage } from "@faridalms/domain/file";
import type { ProjectFile, ProjectLanguage } from "@faridalms/domain/project";
import type { Level } from "@faridalms/puzzles/level";
import type { ComponentType } from "react";

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
    draft: (fileId: string, language: SpeechLanguage) => Promise<void>;
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
 * The studios a teacher builds a question's starter project in. `edit`
 * opens the coding studio and resolves to the saved project's file, null
 * for none, or undefined when the teacher closed the studio without
 * saving. `editFiles` opens the project studio on a question's files, or
 * on an empty project of its language, and resolves to them as the teacher
 * left them.
 */
export interface EditorStudio {
  edit: (fileId: string | null) => Promise<string | null | undefined>;
  editFiles: (
    files: readonly ProjectFile[],
    language: ProjectLanguage,
  ) => Promise<ProjectFile[]>;
}

/**
 * Where a teacher makes a puzzle question's grid. `edit` opens the
 * designer on the question's puzzle and resolves to it as the teacher
 * saved it, or to undefined when they closed the designer without saving.
 */
export interface EditorPuzzles {
  edit: (level: Level) => Promise<Level | undefined>;
}

/** A tag in the question bank and how many questions a quiz may draw by it. */
export interface BankTag {
  tag: string;
  questions: number;
}

/**
 * The question bank: `keep` offers a question, as a document holding it, to
 * be kept for asking again; `choose` resolves to a kept one, or null when
 * nothing was chosen; `tags` lists what a quiz may draw by.
 */
export interface EditorBank {
  keep: (question: ContentDocument) => void;
  choose: () => Promise<ContentDocument | null>;
  tags: () => Promise<BankTag[]>;
}

/** One of the school's standards, as a question's tags show it. */
export interface StandardRef {
  id: string;
  code: string;
  statement: string;
  frameworkTitle: string;
}

/**
 * The school's standards a question may be tagged with: `search` finds them
 * by code or words, and `describe` reads the ones a question carries.
 */
export interface EditorStandards {
  search: (query: string) => Promise<StandardRef[]>;
  describe: (ids: string[]) => Promise<StandardRef[]>;
}

/**
 * Blocks kept once and shown in many documents. `View` draws one as its
 * readers see it; `keep` offers blocks to keep and resolves to the shared
 * block made of them, `choose` to one chosen to show here, each null when
 * the teacher thought better of it; `edit` opens one to change wherever it
 * shows, and `read` gives its content to make a copy of.
 */
export interface EditorShared {
  View: ComponentType<{ id: string }>;
  keep: (content: ContentDocument) => Promise<string | null>;
  choose: () => Promise<string | null>;
  edit: (id: string) => void;
  read: (id: string) => Promise<ContentDocument | null>;
}

/** A person or piece of teaching to mention, with words that tell it from others of its name. */
export interface MentionOption extends Mention {
  detail?: string;
}

/** Finds whom and what the writer may mention, among those they may see. */
export interface EditorMentions {
  search: (query: string) => Promise<MentionOption[]>;
}

/** The school's outside tools a document may link to, and where a link opens. */
export interface EditorTools {
  list: { id: string; name: string; deepLinking: boolean }[];
  /** Where a link launches from; none until the document is saved. */
  href: (linkId: string) => string | null;
}

export interface EditorEnvironment {
  strings: EditorStrings;
  media?: EditorMedia;
  /** Links to outside tools; absent where the school has none to offer. */
  tools?: EditorTools;
  /** Offers coding questions; absent where no studio is set up. */
  studio?: EditorStudio;
  /** Offers puzzle questions; absent where there is no designer to make one in. */
  puzzles?: EditorPuzzles;
  /** Keeps questions to ask again and asks kept ones; absent where none are kept. */
  bank?: EditorBank;
  /** Tags questions with the school's standards; absent where none are read. */
  standards?: EditorStandards;
  /** Keeps blocks to show in many documents; absent where none are kept. */
  shared?: EditorShared;
  /** Mentions people and teaching with @; absent where nobody may be found. */
  mentions?: EditorMentions;
  locale: string;
  /** The document may ask questions, as a lesson or quiz does. */
  questions?: boolean;
  /** The document may stop at continue gates. */
  gates?: boolean;
  /** The document is a quiz, whose attempts may each draw questions from the bank. */
  draws?: boolean;
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
  /**
   * Questions may keep how they went until the end of the lesson, or until
   * the teacher shows the class, as a lesson for older students may.
   */
  feedbackTiming?: boolean;
}

const Context = createContext<EditorEnvironment | null>(null);

export const EditorEnvironmentProvider = Context.Provider;

export function useEditorEnvironment(): EditorEnvironment {
  const value = useContext(Context);
  if (!value) throw new Error("Editor environment is missing");
  return value;
}
