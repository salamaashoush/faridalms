import * as absenceReportsSystem from "./systems/absence-reports";
import * as accessSystem from "./systems/access";
import * as announcementsSystem from "./systems/announcements";
import * as attendanceSystem from "./systems/attendance";
import * as badgesSystem from "./systems/badges";
import * as bankSystem from "./systems/bank";
import * as calendarSystem from "./systems/calendar";
import * as classesSystem from "./systems/classes";
import * as consentsSystem from "./systems/consents";
import * as courseworkSystem from "./systems/coursework";
import * as coverSystem from "./systems/cover";
import * as documentsSystem from "./systems/documents";
import * as examsSystem from "./systems/exams";
import * as filesSystem from "./systems/files";
import * as followUpSystem from "./systems/follow-up";
import * as frontDeskSystem from "./systems/front-desk";
import * as gradebookSystem from "./systems/gradebook";
import * as gradingSystem from "./systems/grading";
import * as homeSystem from "./systems/home";
import * as hostsSystem from "./systems/hosts";
import * as identifiersSystem from "./systems/identifiers";
import * as identity from "./systems/identity";
import * as learningSystem from "./systems/learning";
import * as librarySystem from "./systems/library";
import * as ltiSystem from "./systems/lti";
import * as messagesSystem from "./systems/messages";
import * as newsSystem from "./systems/news";
import * as notificationsSystem from "./systems/notifications";
import * as peerSystem from "./systems/peer";
import * as peopleSystem from "./systems/people";
import * as privacySystem from "./systems/privacy";
import * as productSystem from "./systems/product";
import * as recordsSystem from "./systems/records";
import * as rolloverSystem from "./systems/rollover";
import * as schoolSystem from "./systems/school";
import * as searchSystem from "./systems/search";
import * as sharedSystem from "./systems/shared";
import * as siteSystem from "./systems/site";
import * as standardsSystem from "./systems/standards";
import * as templatesSystem from "./systems/templates";
import * as timetableSystem from "./systems/timetable";
import * as yearsSystem from "./systems/years";

export const router = {
  identifiers: identifiersSystem,
  identity,
  people: peopleSystem,
  badges: badgesSystem,
  access: accessSystem,
  school: schoolSystem,
  records: recordsSystem,
  classes: classesSystem,
  consents: consentsSystem,
  years: yearsSystem,
  files: filesSystem,
  documents: documentsSystem,
  templates: templatesSystem,
  bank: bankSystem,
  shared: sharedSystem,
  standards: standardsSystem,
  coursework: courseworkSystem,
  peer: peerSystem,
  exams: examsSystem,
  gradebook: gradebookSystem,
  grading: gradingSystem,
  privacy: privacySystem,
  attendance: attendanceSystem,
  absenceReports: absenceReportsSystem,
  followUp: followUpSystem,
  frontDesk: frontDeskSystem,
  rollover: rolloverSystem,
  timetable: timetableSystem,
  cover: coverSystem,
  messages: messagesSystem,
  announcements: announcementsSystem,
  news: newsSystem,
  calendar: calendarSystem,
  notifications: notificationsSystem,
  learning: learningSystem,
  library: librarySystem,
  lti: ltiSystem,
  site: siteSystem,
  product: productSystem,
  hosts: hostsSystem,
  home: homeSystem,
  search: searchSystem,
};
export type AppRouter = typeof router;
