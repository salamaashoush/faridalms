import * as v from "valibot";

import * as m from "~/i18n/messages";

export const passwordSchema = v.pipe(
  v.string(m.validationRequired()),
  v.minLength(8, m.validationMinLength({ count: 8 })),
);
