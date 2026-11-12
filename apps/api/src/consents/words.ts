import type { UnitContext } from "../core/context";

import { draftWords } from "../core/publication";

/** A consent form's words in both languages as they now stand. */
export async function consentWords(context: UnitContext, formId: string) {
  const words = await draftWords(context, {
    type: "privacy_notice",
    id: formId,
  });
  return { body: words.body, translation: words.other };
}
