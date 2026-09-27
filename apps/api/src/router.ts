import * as administration from "./modules/administration";
import * as communication from "./modules/communication";
import * as learning from "./modules/learning";
import * as newsletters from "./modules/newsletters";
import * as notifications from "./modules/notifications";
import * as overviews from "./modules/overviews";
import * as search from "./modules/search";
import * as site from "./modules/site";
import * as students from "./modules/students";
import * as teaching from "./modules/teaching";
import * as accessSystem from "./systems/access";
import * as announcementsSystem from "./systems/announcements";
import * as attendanceSystem from "./systems/attendance";
import * as classesSystem from "./systems/classes";
import * as courseworkSystem from "./systems/coursework";
import * as filesSystem from "./systems/files";
import * as gradebookSystem from "./systems/gradebook";
import * as identity from "./systems/identity";
import * as messagesSystem from "./systems/messages";
import * as peopleSystem from "./systems/people";
import * as recordsSystem from "./systems/records";
import * as rolloverSystem from "./systems/rollover";
import * as schoolSystem from "./systems/school";
import * as timetableSystem from "./systems/timetable";
import * as yearsSystem from "./systems/years";

export const router = {
  identity,
  people: peopleSystem,
  access: accessSystem,
  school: schoolSystem,
  records: recordsSystem,
  classes: classesSystem,
  years: yearsSystem,
  files: filesSystem,
  coursework: courseworkSystem,
  gradebook: gradebookSystem,
  attendance: attendanceSystem,
  rollover: rolloverSystem,
  timetable: timetableSystem,
  messages: messagesSystem,
  announcements: announcementsSystem,
  ...students,
  ...overviews,
  ...teaching,
  ...administration,
  ...communication,
  ...newsletters,
  ...notifications,
  ...site,
  ...learning,
  ...search,
};
export type AppRouter = typeof router;
