import type { ModuleFillings } from "~/utils/extension";

import * as m from "~/i18n/messages";
import { replaceWords } from "~/utils/words";

/** A year's rollover asks the families whether each child returns, and words it so. */
export const FAMILIES_IN_YEARS: ModuleFillings = {
  module: "families",
  needs: ["school_years"],
  fillings: [
    replaceWords(m.rolloverFamiliesTitleCore, m.rolloverFamiliesTitle),
    replaceWords(m.rolloverFamiliesHintCore, m.rolloverFamiliesHint),
    replaceWords(m.rolloverAskFamiliesCore, m.rolloverAskFamilies),
    replaceWords(m.rolloverAskTitleCore, m.rolloverAskTitle),
    replaceWords(m.rolloverAskBodyCore, m.rolloverAskBody),
    replaceWords(m.rolloverAskConfirmCore, m.rolloverAskConfirm),
    replaceWords(m.rolloverAskedOnCore, m.rolloverAskedOn),
    replaceWords(m.rolloverFamilyReturningCore, m.rolloverFamilyReturning),
    replaceWords(m.rolloverFamilyUndecidedCore, m.rolloverFamilyUndecided),
    replaceWords(m.rolloverFamilyLeavingCore, m.rolloverFamilyLeaving),
  ],
};
