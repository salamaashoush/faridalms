import type { Rubric } from "@faridalms/domain/coursework";
import type { ProsodyDimension } from "@faridalms/domain/reading";

import { PROSODY_DIMENSIONS, PROSODY_LEVELS } from "@faridalms/domain/reading";

import * as m from "~/i18n/messages";

/** Each prosody dimension's name. */
export const PROSODY_TITLE: Record<ProsodyDimension, () => string> = {
  expression: m.prosodyExpression,
  phrasing: m.prosodyPhrasing,
  smoothness: m.prosodySmoothness,
  pace: m.prosodyPace,
};

/** What each level of each dimension sounds like, from 1 to 4. */
export const PROSODY_LEVEL: Record<
  ProsodyDimension,
  readonly (() => string)[]
> = {
  expression: [
    m.prosodyExpression1,
    m.prosodyExpression2,
    m.prosodyExpression3,
    m.prosodyExpression4,
  ],
  phrasing: [
    m.prosodyPhrasing1,
    m.prosodyPhrasing2,
    m.prosodyPhrasing3,
    m.prosodyPhrasing4,
  ],
  smoothness: [
    m.prosodySmoothness1,
    m.prosodySmoothness2,
    m.prosodySmoothness3,
    m.prosodySmoothness4,
  ],
  pace: [m.prosodyPace1, m.prosodyPace2, m.prosodyPace3, m.prosodyPace4],
};

/**
 * Prosody for work read aloud, as a rubric the teacher attaches and may
 * change: the Multidimensional Fluency Scale's four dimensions, each worth
 * its level from 1 to 4, worded in the teacher's language.
 */
export function prosodyRubric(): Rubric {
  return {
    criteria: PROSODY_DIMENSIONS.map((dimension) => ({
      id: dimension,
      title: PROSODY_TITLE[dimension](),
      levels: PROSODY_LEVELS.toReversed().map((level) => ({
        id: `level-${level}`,
        title: m.prosodyLevel({ level }),
        points: level,
        description: PROSODY_LEVEL[dimension][level - 1]?.() ?? "",
      })),
    })),
  };
}
