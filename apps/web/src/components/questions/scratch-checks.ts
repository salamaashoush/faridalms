import type { ScratchFeature } from "@faridalms/domain/scratch-project";

import type { Locale } from "~/i18n/runtime";

import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

/**
 * What each thing a coding project can be asked to do is called, in the
 * page's language or, for paper, the document's.
 */
export function featureNames(
  locale: Locale = getLocale(),
): Record<ScratchFeature, string> {
  const at = { locale };
  return {
    flag: m.scratchHasFlag({}, at),
    loop: m.scratchHasLoop({}, at),
    choice: m.scratchHasChoice({}, at),
    variable: m.scratchHasVariable({}, at),
    message: m.scratchHasMessage({}, at),
    sprites: m.scratchHasSprites({}, at),
    input: m.scratchHasInput({}, at),
    sound: m.scratchHasSound({}, at),
    custom: m.scratchHasCustom({}, at),
    clones: m.scratchHasClones({}, at),
  };
}
