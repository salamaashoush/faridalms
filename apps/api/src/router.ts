import * as academicYears from "./modules/academic-years";
import * as academics from "./modules/academics";
import * as administration from "./modules/administration";
import * as announcements from "./modules/announcements";
import * as assignments from "./modules/assignments";
import * as auth from "./modules/auth";
import * as communication from "./modules/communication";
import * as files from "./modules/files";
import * as newsletters from "./modules/newsletters";
import * as notifications from "./modules/notifications";
import * as overviews from "./modules/overviews";
import * as students from "./modules/students";
import * as teaching from "./modules/teaching";

export const router = {
  auth,
  ...students,
  ...overviews,
  ...teaching,
  ...administration,
  ...academics,
  ...academicYears,
  ...communication,
  ...newsletters,
  ...assignments,
  ...files,
  ...notifications,
  ...announcements,
};
export type AppRouter = typeof router;
