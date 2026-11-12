import {
  lessonTitles,
  moduleOfLesson,
  moduleTitles,
} from "@faridalms/database/stores/learning";

import type { FileHost } from "../files/authorize";

/** The kinds of record this module keeps files and documents in, filled as its systems load. */
export const ELEARNING_HOSTS: FileHost[] = [
  {
    hostType: "lesson",
    titlesOf: async (context, ids) =>
      new Map(
        [...(await lessonTitles(context.tx, context.tenantId, ids))].map(
          ([id, row]) => [
            id,
            {
              titleEn: row.title,
              titleAr: row.title,
              placeEn: row.module,
              placeAr: row.module,
            },
          ],
        ),
      ),
    parentOf: (context, id) => moduleOfLesson(context.tx, context.tenantId, id),
  },
  {
    hostType: "module_plan",
    titlesOf: async (context, ids) =>
      new Map(
        [...(await moduleTitles(context.tx, context.tenantId, ids))].map(
          ([id, title]) => [id, { titleEn: title, titleAr: title }],
        ),
      ),
  },
];
