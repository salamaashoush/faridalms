import type { TemplateUse } from "~/components/templates/slots";

import { classTitle } from "~/components/classes/format";
import * as m from "~/i18n/messages";
import { courseworkOptionsQuery } from "~/queries/coursework";

type Options = Awaited<ReturnType<typeof courseworkOptionsQuery.queryFn>>;

/** An assignment starts in a class, or unplaced to pick one in the editor. */
export const ASSIGNMENT_TEMPLATE: TemplateUse = {
  kind: "assignment",
  places: {
    query: () => courseworkOptionsQuery,
    options: (read) =>
      (read as Options).classes.map((row) => ({
        value: row.id,
        label: classTitle(row),
      })),
    label: m.templatesClass,
    required: false,
  },
  start: {
    run: ({ templateId, place, navigate }) =>
      void navigate({
        to: "/assignment-editor",
        search: { template: templateId, ...(place ? { classId: place } : {}) },
      }),
  },
};
