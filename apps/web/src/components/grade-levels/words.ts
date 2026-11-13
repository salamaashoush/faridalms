import type { GradeWording } from "@faridalms/domain/grade-levels";

import { gradeWordingOf } from "@faridalms/domain/grade-levels";

import type { Wording } from "~/utils/extension";
import type { Sentence } from "~/utils/words";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";

/**
 * One sentence written out for every word a school may choose, each its
 * own sentence in both catalogues, since Arabic agreement differs between
 * them. `unset` is how it read before the school chose.
 */
const termed = <F extends Sentence>(
  unset: F,
  terms: Readonly<Record<Exclude<GradeWording, "unset">, NoInfer<F>>>,
): Readonly<Record<GradeWording, F>> => ({ unset, ...terms });

const GRADE_SENTENCES = {
  tab: termed(m.gradeLevelsTab, {
    grade: m.gradeLevelsTabAsGrade,
    level: m.gradeLevelsTabAsLevel,
    year_group: m.gradeLevelsTabAsYearGroup,
    stage: m.gradeLevelsTabAsStage,
  }),
  name: termed(m.gradeLevelsName, {
    grade: m.studentGrade,
    level: m.gradeLevelsNameAsLevel,
    year_group: m.gradeLevelsNameAsYearGroup,
    stage: m.gradeLevelsNameAsStage,
  }),
  caption: termed(m.gradeLevelsCaption, {
    grade: m.gradeLevelsCaptionAsGrade,
    level: m.gradeLevelsCaptionAsLevel,
    year_group: m.gradeLevelsCaptionAsYearGroup,
    stage: m.gradeLevelsCaptionAsStage,
  }),
  add: termed(m.gradeLevelsAdd, {
    grade: m.gradeLevelsAddAsGrade,
    level: m.gradeLevelsAddAsLevel,
    year_group: m.gradeLevelsAddAsYearGroup,
    stage: m.gradeLevelsAddAsStage,
  }),
  emptyTitle: termed(m.gradeLevelsEmptyTitle, {
    grade: m.gradeLevelsEmptyTitleAsGrade,
    level: m.gradeLevelsEmptyTitleAsLevel,
    year_group: m.gradeLevelsEmptyTitleAsYearGroup,
    stage: m.gradeLevelsEmptyTitleAsStage,
  }),
  retireBody: termed(m.gradeLevelsRetireBody, {
    grade: m.gradeLevelsRetireBody,
    level: m.gradeLevelsRetireBody,
    year_group: m.gradeLevelsRetireBody,
    stage: m.gradeLevelsRetireBodyAsStage,
  }),
  retired: termed(m.gradeLevelsRetired, {
    grade: m.gradeLevelsRetired,
    level: m.gradeLevelsRetired,
    year_group: m.gradeLevelsRetired,
    stage: m.gradeLevelsRetiredAsStage,
  }),
  grade: termed(m.studentGrade, {
    grade: m.studentGrade,
    level: m.studentGradeAsLevel,
    year_group: m.studentGradeAsYearGroup,
    stage: m.studentGradeAsStage,
  }),
  change: termed(m.studentChangeGrade, {
    grade: m.studentChangeGrade,
    level: m.studentChangeGradeAsLevel,
    year_group: m.studentChangeGradeAsYearGroup,
    stage: m.studentChangeGradeAsStage,
  }),
  studentHint: termed(m.studentGradeHint, {
    grade: m.studentGradeHint,
    level: m.studentGradeHintAsLevel,
    year_group: m.studentGradeHintAsYearGroup,
    stage: m.studentGradeHintAsStage,
  }),
  history: termed(m.studentGradeHistory, {
    grade: m.studentGradeHistory,
    level: m.studentGradeHistoryAsLevel,
    year_group: m.studentGradeHistoryAsYearGroup,
    stage: m.studentGradeHistoryAsStage,
  }),
  historyEmpty: termed(m.studentGradeHistoryEmpty, {
    grade: m.studentGradeHistoryEmpty,
    level: m.studentGradeHistoryEmptyAsLevel,
    year_group: m.studentGradeHistoryEmptyAsYearGroup,
    stage: m.studentGradeHistoryEmptyAsStage,
  }),
  setupTitle: termed(m.setupClassesTitle, {
    grade: m.setupClassesTitle,
    level: m.setupClassesTitleAsLevel,
    year_group: m.setupClassesTitleAsYearGroup,
    stage: m.setupClassesTitleAsStage,
  }),
  setupBody: termed(m.setupClassesBody, {
    grade: m.setupClassesBody,
    level: m.setupClassesBodyAsLevel,
    year_group: m.setupClassesBodyAsYearGroup,
    stage: m.setupClassesBodyAsStage,
  }),
};

type GradeSentences = typeof GRADE_SENTENCES;

/** The grade levels module's sentences in one school's word. */
export type GradeWords = {
  readonly [K in keyof GradeSentences]: GradeSentences[K]["unset"];
};

/** Every sentence in the word given. */
export function gradeWordsIn(wording: GradeWording): GradeWords {
  return Object.fromEntries(
    Object.entries(GRADE_SENTENCES).map(([key, choices]) => [
      key,
      choices[wording],
    ]),
  ) as GradeWords;
}

/** The word the school chose for its grades, from the wording on the current user's face. */
export const gradeWordingIn = (wording: Wording): GradeWording =>
  gradeWordingOf(wording.grade_levels);

/** The module's sentences in the viewer's school's word. */
export function useGradeWords(): GradeWords {
  return gradeWordsIn(gradeWordingIn(useCurrentUser().wording));
}
