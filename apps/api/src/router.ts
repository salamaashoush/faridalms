import * as administration from "./modules/administration";
import * as students from "./modules/students";
import * as accessSystem from "./systems/access";
import * as announcementsSystem from "./systems/announcements";
import * as attendanceSystem from "./systems/attendance";
import * as calendarSystem from "./systems/calendar";
import * as classesSystem from "./systems/classes";
import * as courseworkSystem from "./systems/coursework";
import * as documentsSystem from "./systems/documents";
import * as examsSystem from "./systems/exams";
import * as filesSystem from "./systems/files";
import * as gradebookSystem from "./systems/gradebook";
import * as homeSystem from "./systems/home";
import * as identity from "./systems/identity";
import * as learningSystem from "./systems/learning";
import * as messagesSystem from "./systems/messages";
import * as newslettersSystem from "./systems/newsletters";
import * as notificationsSystem from "./systems/notifications";
import * as peopleSystem from "./systems/people";
import * as recordsSystem from "./systems/records";
import * as rolloverSystem from "./systems/rollover";
import * as schoolSystem from "./systems/school";
import * as searchSystem from "./systems/search";
import * as siteSystem from "./systems/site";
import * as templatesSystem from "./systems/templates";
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
  documents: documentsSystem,
  templates: templatesSystem,
  coursework: courseworkSystem,
  exams: examsSystem,
  gradebook: gradebookSystem,
  attendance: attendanceSystem,
  rollover: rolloverSystem,
  timetable: timetableSystem,
  messages: messagesSystem,
  announcements: announcementsSystem,
  newsletters: newslettersSystem,
  calendar: calendarSystem,
  notifications: notificationsSystem,
  learning: learningSystem,
  site: siteSystem,
  home: homeSystem,
  search: searchSystem,
  ...students,
  ...administration,
};
export type AppRouter = typeof router;
