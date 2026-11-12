import type { TemplateUse } from "~/components/templates/slots";

import { classTitle } from "~/components/classes/format";
import * as m from "~/i18n/messages";
import { learningOptionsQuery } from "~/queries/learning";
import { moduleFromTemplate } from "~/server/learning";

type Options = Awaited<ReturnType<typeof learningOptionsQuery.queryFn>>;

const modulePlaces = {
  query: () => learningOptionsQuery,
  options: (read: unknown) =>
    (read as Options).modules.map((row) => ({
      value: row.id,
      label: row.title,
    })),
  label: m.templatesModule,
  required: true,
};

/** A lesson or plan starts in a module, and a module in a class. */
export const LEARNING_TEMPLATES: readonly TemplateUse[] = [
  {
    kind: "lesson",
    places: modulePlaces,
    start: {
      run: ({ templateId, place, navigate }) =>
        void navigate({
          to: "/lesson-editor",
          search: { moduleId: place, template: templateId },
        }),
    },
  },
  {
    kind: "unit_plan",
    places: { ...modulePlaces, hint: m.templatesPlanHint },
    start: {
      run: ({ templateId, place, navigate }) =>
        void navigate({
          to: "/module-plan",
          search: { moduleId: place, template: templateId },
        }),
    },
  },
  {
    kind: "module",
    places: {
      query: () => learningOptionsQuery,
      options: (read) =>
        (read as Options).classes.map((row) => ({
          value: row.id,
          label: classTitle(row),
        })),
      label: m.templatesClass,
      required: true,
    },
    start: {
      run: async ({ templateId, place, navigate, queryClient }) => {
        const { id } = await moduleFromTemplate({
          data: { id: templateId, classId: place },
        });
        await queryClient.invalidateQueries({ queryKey: ["learning"] });
        void navigate({ to: "/modules/$moduleId", params: { moduleId: id } });
      },
    },
  },
];
