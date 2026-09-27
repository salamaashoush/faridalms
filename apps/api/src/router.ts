import * as academics from "./modules/academics";
import * as administration from "./modules/administration";
import * as announcements from "./modules/announcements";
import * as assignments from "./modules/assignments";
import * as communication from "./modules/communication";
import * as files from "./modules/files";
import * as learning from "./modules/learning";
import * as newsletters from "./modules/newsletters";
import * as notifications from "./modules/notifications";
import * as overviews from "./modules/overviews";
import * as people from "./modules/people";
import * as rollover from "./modules/rollover";
import * as search from "./modules/search";
import * as site from "./modules/site";
import * as students from "./modules/students";
import * as teaching from "./modules/teaching";
import * as timetable from "./modules/timetable";
import * as accessSystem from "./systems/access";
import * as classesSystem from "./systems/classes";
import * as identity from "./systems/identity";
import * as peopleSystem from "./systems/people";
import * as recordsSystem from "./systems/records";
import * as schoolSystem from "./systems/school";
import * as yearsSystem from "./systems/years";

export const router = {
  identity,
  people: peopleSystem,
  access: accessSystem,
  school: schoolSystem,
  records: recordsSystem,
  classes: classesSystem,
  years: yearsSystem,
  ...students,
  ...overviews,
  ...teaching,
  ...administration,
  ...academics,
  ...communication,
  ...newsletters,
  ...assignments,
  ...files,
  ...notifications,
  ...announcements,
  ...people,
  ...site,
  ...learning,
  ...timetable,
  ...search,
  ...rollover,
};
export type AppRouter = typeof router;
