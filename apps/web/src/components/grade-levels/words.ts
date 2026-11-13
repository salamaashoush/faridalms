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
  audienceKind: termed(m.annScopeGrade, {
    grade: m.annScopeGrade,
    level: m.annScopeGradeAsLevel,
    year_group: m.annScopeGradeAsYearGroup,
    stage: m.annScopeGradeAsStage,
  }),
  audienceTarget: termed(m.annGrade, {
    grade: m.annGrade,
    level: m.annGradeAsLevel,
    year_group: m.annGradeAsYearGroup,
    stage: m.annGradeAsStage,
  }),
  audiencePick: termed(m.annPickGrade, {
    grade: m.annPickGrade,
    level: m.annPickGradeAsLevel,
    year_group: m.annPickGradeAsYearGroup,
    stage: m.annPickGradeAsStage,
  }),
  audienceChoose: termed(m.annAudienceTarget, {
    grade: m.annAudienceTarget,
    level: m.annAudienceTargetAsLevel,
    year_group: m.annAudienceTargetAsYearGroup,
    stage: m.annAudienceTargetAsStage,
  }),
  audienceReachesFamilies: termed(m.annAudienceHint, {
    grade: m.annAudienceHint,
    level: m.annAudienceHintAsLevel,
    year_group: m.annAudienceHintAsYearGroup,
    stage: m.annAudienceHintAsStage,
  }),
  rolloverClasses: termed(m.rolloverClassesHint, {
    grade: m.rolloverClassesHint,
    level: m.rolloverClassesHintAsLevel,
    year_group: m.rolloverClassesHintAsYearGroup,
    stage: m.rolloverClassesHintAsStage,
  }),
  rolloverStudents: termed(m.rolloverStudentsHint, {
    grade: m.rolloverStudentsHint,
    level: m.rolloverStudentsHintAsLevel,
    year_group: m.rolloverStudentsHintAsYearGroup,
    stage: m.rolloverStudentsHintAsStage,
  }),
  placementHistory: termed(m.studentPlacementHistoryHint, {
    grade: m.studentPlacementHistoryHint,
    level: m.studentPlacementHistoryHintAsLevel,
    year_group: m.studentPlacementHistoryHintAsYearGroup,
    stage: m.studentPlacementHistoryHintAsStage,
  }),
  programmeDerived: termed(m.gradingByGradeLevel, {
    grade: m.gradingByGradeLevel,
    level: m.gradingByGradeLevelAsLevel,
    year_group: m.gradingByGradeLevelAsYearGroup,
    stage: m.gradingByGradeLevelAsStage,
  }),
  programmeOption: termed(m.gradingByGradeLevelOption, {
    grade: m.gradingByGradeLevelOption,
    level: m.gradingByGradeLevelOptionAsLevel,
    year_group: m.gradingByGradeLevelOptionAsYearGroup,
    stage: m.gradingByGradeLevelOptionAsStage,
  }),
  programmeChoose: termed(m.gradingClassProgrammeHint, {
    grade: m.gradingClassProgrammeHint,
    level: m.gradingClassProgrammeHintAsLevel,
    year_group: m.gradingClassProgrammeHintAsYearGroup,
    stage: m.gradingClassProgrammeHintAsStage,
  }),
  programmeLevels: termed(m.gradingGradeLevels, {
    grade: m.gradingGradeLevels,
    level: m.gradingGradeLevelsAsLevel,
    year_group: m.gradingGradeLevelsAsYearGroup,
    stage: m.gradingGradeLevelsAsStage,
  }),
  programmeLevelsHint: termed(m.gradingGradeLevelsHint, {
    grade: m.gradingGradeLevelsHint,
    level: m.gradingGradeLevelsHintAsLevel,
    year_group: m.gradingGradeLevelsHintAsYearGroup,
    stage: m.gradingGradeLevelsHintAsStage,
  }),
  programmesEmpty: termed(m.gradingProgrammesEmptyHint, {
    grade: m.gradingProgrammesEmptyHint,
    level: m.gradingProgrammesEmptyHintAsLevel,
    year_group: m.gradingProgrammesEmptyHintAsYearGroup,
    stage: m.gradingProgrammesEmptyHintAsStage,
  }),
  programmeRetire: termed(m.gradingRetireProgrammeBody, {
    grade: m.gradingRetireProgrammeBody,
    level: m.gradingRetireProgrammeBodyAsLevel,
    year_group: m.gradingRetireProgrammeBodyAsYearGroup,
    stage: m.gradingRetireProgrammeBodyAsStage,
  }),
  programmesHint: termed(m.gradingProgrammesHint, {
    grade: m.gradingProgrammesHint,
    level: m.gradingProgrammesHintAsLevel,
    year_group: m.gradingProgrammesHintAsYearGroup,
    stage: m.gradingProgrammesHintAsStage,
  }),
  readingHint: termed(m.readingStaffHint, {
    grade: m.readingStaffHint,
    level: m.readingStaffHintAsLevel,
    year_group: m.readingStaffHintAsYearGroup,
    stage: m.readingStaffHintAsStage,
  }),
  readingNormLine: termed(m.readingNormLine, {
    grade: m.readingNormLine,
    level: m.readingNormLineAsLevel,
    year_group: m.readingNormLineAsYearGroup,
    stage: m.readingNormLineAsStage,
  }),
  readingDefaultEnglish: termed(m.readingNormsDefaultEn, {
    grade: m.readingNormsDefaultEn,
    level: m.readingNormsDefaultEnAsLevel,
    year_group: m.readingNormsDefaultEnAsYearGroup,
    stage: m.readingNormsDefaultEnAsStage,
  }),
  readingDefaultArabic: termed(m.readingNormsDefaultAr, {
    grade: m.readingNormsDefaultAr,
    level: m.readingNormsDefaultArAsLevel,
    year_group: m.readingNormsDefaultArAsYearGroup,
    stage: m.readingNormsDefaultArAsStage,
  }),
  readingEmpty: termed(m.readingNormsEmpty, {
    grade: m.readingNormsEmpty,
    level: m.readingNormsEmptyAsLevel,
    year_group: m.readingNormsEmptyAsYearGroup,
    stage: m.readingNormsEmptyAsStage,
  }),
  readingTable: termed(m.readingNormsTable, {
    grade: m.readingNormsTable,
    level: m.readingNormsTableAsLevel,
    year_group: m.readingNormsTableAsYearGroup,
    stage: m.readingNormsTableAsStage,
  }),
  readingGrade: termed(m.readingGrade, {
    grade: m.readingGrade,
    level: m.studentGradeAsLevel,
    year_group: m.studentGradeAsYearGroup,
    stage: m.studentGradeAsStage,
  }),
  readingRepeated: termed(m.readingErrNormRepeated, {
    grade: m.readingErrNormRepeated,
    level: m.readingErrNormRepeatedAsLevel,
    year_group: m.readingErrNormRepeatedAsYearGroup,
    stage: m.readingErrNormRepeatedAsStage,
  }),
  readingRemove: termed(m.readingNormRemoveBody, {
    grade: m.readingNormRemoveBody,
    level: m.readingNormRemoveBodyAsLevel,
    year_group: m.readingNormRemoveBodyAsYearGroup,
    stage: m.readingNormRemoveBodyAsStage,
  }),
  intakeGrade: termed(m.itkFieldGrade, {
    grade: m.itkFieldGrade,
    level: m.studentGradeAsLevel,
    year_group: m.studentGradeAsYearGroup,
    stage: m.studentGradeAsStage,
  }),
  letterGrade: termed(m.ltrFieldGrade, {
    grade: m.ltrFieldGrade,
    level: m.ltrFieldGradeAsLevel,
    year_group: m.ltrFieldGradeAsYearGroup,
    stage: m.ltrFieldGradeAsStage,
  }),
  intakeCaption: termed(m.itkCaption, {
    grade: m.itkCaption,
    level: m.itkCaptionAsLevel,
    year_group: m.itkCaptionAsYearGroup,
    stage: m.itkCaptionAsStage,
  }),
  intakeCapacity: termed(m.itkFieldCapacityHint, {
    grade: m.itkFieldCapacityHint,
    level: m.itkFieldCapacityHintAsLevel,
    year_group: m.itkFieldCapacityHintAsYearGroup,
    stage: m.itkFieldCapacityHintAsStage,
  }),
  intakeChecklist: termed(m.itkSectionChecklistHint, {
    grade: m.itkSectionChecklistHint,
    level: m.itkSectionChecklistHintAsLevel,
    year_group: m.itkSectionChecklistHintAsYearGroup,
    stage: m.itkSectionChecklistHintAsStage,
  }),
  applyNone: termed(m.applyNoIntakes, {
    grade: m.applyNoIntakes,
    level: m.applyNoIntakesAsLevel,
    year_group: m.applyNoIntakesAsYearGroup,
    stage: m.applyNoIntakesAsStage,
  }),
  applyTitle: termed(m.applyIntakeTitle, {
    grade: m.applyIntakeTitle,
    level: m.applyIntakeTitleAsLevel,
    year_group: m.applyIntakeTitleAsYearGroup,
    stage: m.applyIntakeTitleAsStage,
  }),
  applyHint: termed(m.applyIntakeHint, {
    grade: m.applyIntakeHint,
    level: m.applyIntakeHintAsLevel,
    year_group: m.applyIntakeHintAsYearGroup,
    stage: m.applyIntakeHintAsStage,
  }),
  ageFits: termed(m.aplAgeFits, {
    grade: m.aplAgeFits,
    level: m.aplAgeFitsAsLevel,
    year_group: m.aplAgeFitsAsYearGroup,
    stage: m.aplAgeFitsAsStage,
  }),
  applicationsEmpty: termed(m.famAppsEmptyBody, {
    grade: m.famAppsEmptyBody,
    level: m.famAppsEmptyBodyAsLevel,
    year_group: m.famAppsEmptyBodyAsYearGroup,
    stage: m.famAppsEmptyBodyAsStage,
  }),
  reportByIntake: termed(m.adrByIntake, {
    grade: m.adrByIntake,
    level: m.adrByIntakeAsLevel,
    year_group: m.adrByIntakeAsYearGroup,
    stage: m.adrByIntakeAsStage,
  }),
  enrolBody: termed(m.brdEnrolBody, {
    grade: m.brdEnrolBody,
    level: m.brdEnrolBodyAsLevel,
    year_group: m.brdEnrolBodyAsYearGroup,
    stage: m.brdEnrolBodyAsStage,
  }),
  siteIntake: termed(m.siteFieldIntakeHint, {
    grade: m.siteFieldIntakeHint,
    level: m.siteFieldIntakeHintAsLevel,
    year_group: m.siteFieldIntakeHintAsYearGroup,
    stage: m.siteFieldIntakeHintAsStage,
  }),
  setupAdmissions: termed(m.setupAdmissionsBody, {
    grade: m.setupAdmissionsBody,
    level: m.setupAdmissionsBodyAsLevel,
    year_group: m.setupAdmissionsBodyAsYearGroup,
    stage: m.setupAdmissionsBodyAsStage,
  }),
  intakeFixed: termed(m.errIntakeFixed, {
    grade: m.errIntakeFixed,
    level: m.errIntakeFixedAsLevel,
    year_group: m.errIntakeFixedAsYearGroup,
    stage: m.errIntakeFixedAsStage,
  }),
  intakeUnknown: termed(m.errIntakeGrade, {
    grade: m.errIntakeGrade,
    level: m.errIntakeGradeAsLevel,
    year_group: m.errIntakeGradeAsYearGroup,
    stage: m.errIntakeGradeAsStage,
  }),
  applyClosed: termed(m.errApplicationClosed, {
    grade: m.errApplicationClosed,
    level: m.errApplicationClosedAsLevel,
    year_group: m.errApplicationClosedAsYearGroup,
    stage: m.errApplicationClosedAsStage,
  }),
  applyYoung: termed(m.errApplicationYoung, {
    grade: m.errApplicationYoung,
    level: m.errApplicationYoungAsLevel,
    year_group: m.errApplicationYoungAsYearGroup,
    stage: m.errApplicationYoungAsStage,
  }),
  applyOld: termed(m.errApplicationOld, {
    grade: m.errApplicationOld,
    level: m.errApplicationOldAsLevel,
    year_group: m.errApplicationOldAsYearGroup,
    stage: m.errApplicationOldAsStage,
  }),
  applyExists: termed(m.errApplicationExists, {
    grade: m.errApplicationExists,
    level: m.errApplicationExistsAsLevel,
    year_group: m.errApplicationExistsAsYearGroup,
    stage: m.errApplicationExistsAsStage,
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
