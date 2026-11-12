import type {
  CheckView,
  FluencyMark,
  StudentBlock,
} from "@faridalms/domain/learning";
import type { ComponentType, ReactNode } from "react";

import { slot } from "~/utils/extension";

import type { BoardAnswer, BoardQuestion } from "./AnswerBoard";
import type { CheckDriver, CheckMode } from "./Checks";

type Of<T extends StudentBlock["type"]> = Extract<StudentBlock, { type: T }>;

export interface StudioAnswerProps<T extends "scratch" | "project"> {
  block: Of<T>;
  view: CheckView | undefined;
  driver: CheckDriver;
  mode: CheckMode;
  locked: boolean;
  /** Where the answer stands with the teacher, said beside its own buttons. */
  status: ReactNode;
}

export interface MarkedStudioAnswerProps {
  question: BoardQuestion;
  answer: BoardAnswer;
  name: string;
  /** The classmate whose project the answer was built on, where it was. */
  remixOf: string | null;
}

/**
 * The questions a learner answers in a studio, a block-coding project or a
 * project of files: how they answer one, and how their teacher reads it.
 */
export interface StudioAnswers {
  Scratch: ComponentType<StudioAnswerProps<"scratch">>;
  Project: ComponentType<StudioAnswerProps<"project">>;
  /** Whether a board's answer is one of these. */
  holds(answer: BoardAnswer): boolean;
  Marked: ComponentType<MarkedStudioAnswerProps>;
}

export const studioAnswers = slot<StudioAnswers>("studio answers");

export interface PassageMarkerProps {
  passage: string;
  mark: FluencyMark;
  onChange: (mark: FluencyMark) => void;
}

export interface PassageSummaryProps {
  passage: string;
  mark: FluencyMark;
}

/** How a passage read aloud is marked word by word, and what a marked one comes to. */
export interface PassageMarks {
  Marker: ComponentType<PassageMarkerProps>;
  Summary: ComponentType<PassageSummaryProps>;
}

export const passageMarks = slot<PassageMarks>("passage marks");
