import { saveNewsletterDraftSchema } from "@faridalms/domain/newsletter";
import { createServerFn } from "@tanstack/react-start";
import * as v from "valibot";

import { backend } from "./backend";

export const getNewsletterDraft = createServerFn({ method: "GET" })
  .inputValidator(v.object({ id: v.pipe(v.string(), v.uuid()) }))
  .handler(({ data }) => backend().getNewsletterDraft(data));
export const getNewsletterDrafts = createServerFn({ method: "GET" })
  .inputValidator(
    v.object({ schoolYearId: v.pipe(v.string(), v.uuid()), page: v.number() }),
  )
  .handler(({ data }) => backend().getNewsletterDrafts(data));
export const saveNewsletterDraft = createServerFn({ method: "POST" })
  .inputValidator(saveNewsletterDraftSchema)
  .handler(({ data }) => backend().saveNewsletterDraft(data));

export const getNewsletterEditorContext = createServerFn({
  method: "GET",
}).handler(() => backend().getNewsletterEditorContext());
