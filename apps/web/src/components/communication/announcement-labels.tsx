import type { AnnouncementAudience } from "@faridalms/domain/notification";

import * as m from "~/i18n/messages";

export const AUDIENCE_LABEL: Record<AnnouncementAudience, () => string> = {
  everyone: m.audienceEveryone,
  parents: m.audienceParents,
  students: m.audienceStudents,
  teachers: m.audienceTeachers,
};
