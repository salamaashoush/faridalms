import type { ModuleFillings } from "~/utils/extension";

import * as m from "~/i18n/messages";
import { replaceWords } from "~/utils/words";

/** Following up absences, worded for the families the office calls. */
export const ATTENDANCE_WITH_FAMILIES: ModuleFillings = {
  module: "attendance",
  needs: ["families"],
  fillings: [
    replaceWords(m.fupCallsHintCore, m.fupCallsHint),
    replaceWords(m.fupNoCallsCore, m.fupNoCalls),
    replaceWords(m.fupNoContactsCore, m.fupNoContacts),
    replaceWords(m.fupReachedCore, m.fupReached),
    replaceWords(m.fupNoteHintCore, m.fupNoteHint),
  ],
};
