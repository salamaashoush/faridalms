import type { ContentDocument } from "@faridalms/domain/content";
import type { ProjectFile } from "@faridalms/domain/project";
import type { ComponentType } from "react";

import type {
  BoardAnswer,
  BoardQuestion,
} from "~/components/questions/AnswerBoard";
import type { planQuery, writtenAnswersQuery } from "~/queries/learning";
import type { SlotQuery } from "~/utils/extension";

import { slot } from "~/utils/extension";

export interface LiveProject {
  lessonId: string;
  blockId: string;
  studentId: string;
  prompt: string;
  files: ProjectFile[];
  keptAt: string;
}

/** A coding project as its student last saved it. */
export interface LiveStudio {
  lessonId: string;
  blockId: string;
  studentId: string;
  prompt: string;
  projectFileId: string;
  thumbnailFileId: string | null;
  savedAt: string;
}

export interface LiveProjectsProps {
  projects: readonly LiveProject[];
  studios: readonly LiveStudio[];
  names: ReadonlyMap<string, string>;
  /** The students still in a lesson. */
  here: ReadonlySet<string>;
  now: string;
}

/** The projects a class builds in a live lesson, as their students last left them. */
export const liveProjects =
  slot<ComponentType<LiveProjectsProps>>("live projects");

type WrittenAnswers = Awaited<
  ReturnType<NonNullable<ReturnType<typeof writtenAnswersQuery>["queryFn"]>>
>;

export interface AnswerGoalsProps {
  moduleId: string;
  classId: string;
  goals: NonNullable<WrittenAnswers["goals"]>;
  question: BoardQuestion;
  answer: BoardAnswer;
  name: string;
}

/** Where a young class's child stands against the goals a lesson's question is tagged with. */
export const answerGoals =
  slot<ComponentType<AnswerGoalsProps>>("answer goals");

/** Lessons and practice may be set as young children meet them. */
export const youngLessons = slot<true>("young lessons");

type Plan = Awaited<
  ReturnType<NonNullable<ReturnType<typeof planQuery>["queryFn"]>>
>;
export type PlanCover = Plan["covered"][number];

export interface PlanCoverageProps {
  content: ContentDocument;
  covered: readonly PlanCover[];
  /** Ruled off as a section of a page, rather than inside the details panel. */
  framed?: boolean;
}

/** A unit plan's standards read against its module's lessons, and its summary line. */
export interface PlanCoverage {
  Coverage: ComponentType<PlanCoverageProps>;
  summary(content: ContentDocument): string;
}

export const planCoverage = slot<PlanCoverage>("plan coverage");

/** A module's discussions, where the school sets them as coursework. */
export interface ModuleDiscussions {
  query(moduleId: string, studentId: string): SlotQuery<unknown>;
}

export const moduleDiscussions = slot<ModuleDiscussions>("module discussions");
