import type { ModuleId } from "@faridalms/domain/modules";
import type { SchoolEntitlements } from "@faridalms/domain/plans";

import { modulesOfSystem } from "@faridalms/domain/modules";
import { availableModules } from "@faridalms/domain/plans";
import { DecoratedProcedure, ORPCError } from "@orpc/server";

import type { UnitContext } from "./core/context";

import { applyAs, registration } from "./admissions/applying-as";
import {
  office as attendanceOffice,
  today as attendanceToday,
} from "./attendance/today";
import { signIn as badgeSignIn } from "./badges/sign-in";
import * as classGroups from "./classes/groups";
import { modulesOf } from "./core/modules";
import { today as courseworkToday } from "./coursework/today";
import {
  running,
  runningDefault,
  runningShown,
  setRunningDefault,
  showRunning,
} from "./gradebook/running";
import { today as learningToday } from "./learning/today";
import { peerSettings } from "./peer/settings";
import * as emergencyContactsSystem from "./people/emergency-contacts-system";
import * as absenceReportsSystem from "./systems/absence-reports";
import * as accessSystem from "./systems/access";
import * as admissionsSystem from "./systems/admissions";
import * as announcementsSystem from "./systems/announcements";
import * as applicationsSystem from "./systems/applications";
import * as applyingSystem from "./systems/applying";
import * as assistantSystem from "./systems/assistant";
import * as attendanceSystem from "./systems/attendance";
import * as badgesSystem from "./systems/badges";
import * as bankSystem from "./systems/bank";
import * as billingSystem from "./systems/billing";
import * as calendarSystem from "./systems/calendar";
import * as classesSystem from "./systems/classes";
import * as commentsSystem from "./systems/comments";
import * as consentsSystem from "./systems/consents";
import * as courseworkSystem from "./systems/coursework";
import * as coverSystem from "./systems/cover";
import * as decisionsSystem from "./systems/decisions";
import * as discovery from "./systems/discovery";
import * as documentsSystem from "./systems/documents";
import * as familySharesSystem from "./systems/family-shares";
import * as filesSystem from "./systems/files";
import * as followUpSystem from "./systems/follow-up";
import * as frontDeskSystem from "./systems/front-desk";
import * as gradeLevelsSystem from "./systems/grade-levels";
import * as gradebookSystem from "./systems/gradebook";
import * as gradingSystem from "./systems/grading";
import * as guardiansSystem from "./systems/guardians";
import * as homeSystem from "./systems/home";
import * as homeroomsSystem from "./systems/homerooms";
import * as hostsSystem from "./systems/hosts";
import * as identifiersSystem from "./systems/identifiers";
import * as identity from "./systems/identity";
import * as intakesSystem from "./systems/intakes";
import * as learningSystem from "./systems/learning";
import * as mediaSystem from "./systems/media";
import * as messagesSystem from "./systems/messages";
import * as notificationsSystem from "./systems/notifications";
import * as peerSystem from "./systems/peer";
import * as peopleSystem from "./systems/people";
import * as periodsSystem from "./systems/periods";
import * as picturesSystem from "./systems/pictures";
import * as privacySystem from "./systems/privacy";
import * as productSystem from "./systems/product";
import * as readingSystem from "./systems/reading";
import * as recordsSystem from "./systems/records";
import * as rolloverSystem from "./systems/rollover";
import * as schoolSystem from "./systems/school";
import * as schoolDaysSystem from "./systems/school-days";
import * as searchSystem from "./systems/search";
import * as sharedSystem from "./systems/shared";
import * as siteSystem from "./systems/site";
import * as standardsSystem from "./systems/standards";
import * as templatesSystem from "./systems/templates";
import * as timetableSystem from "./systems/timetable";
import * as yearsSystem from "./systems/years";
import { today as timetableToday } from "./timetable/today";
import { announcementOptions, announcementPost } from "./website/announcements";

/**
 * A namespace as its module answers it: every procedure of a module that
 * is off at the school, or of a link whose needs are not all on, answers
 * NOT_FOUND, so a procedure added later is gated without anyone
 * remembering to. Core namespaces answer everywhere.
 * Procedures run without a school's unit of work, such as the public site,
 * check their school's modules themselves.
 */
function owned<T extends object>(
  system: string | readonly [string, string],
  procedures: T,
): T {
  const modules = modulesOfSystem(
    typeof system === "string" ? system : system.join("/"),
  );
  if (modules.length === 0) return procedures;
  return Object.fromEntries(
    Object.entries(procedures).map(([name, procedure]) => [
      name,
      procedure instanceof DecoratedProcedure
        ? procedure.use(async ({ context, next }) => {
            for (const module of modules)
              if (!(await answers(context, module)))
                throw new ORPCError("NOT_FOUND");
            return next();
          })
        : procedure,
    ]),
  ) as T;
}

const isUnit = (context: unknown): context is UnitContext =>
  typeof context === "object" && context !== null && "tx" in context;

const hasSchool = (
  context: unknown,
): context is { school: { entitlements: SchoolEntitlements } } =>
  typeof context === "object" && context !== null && "school" in context;

/**
 * Whether a school answers a module's procedure: with a unit of work, by
 * everything that decides it; before one, as on a family's registration, by
 * the plan alone, which settles every module but those a school switches.
 */
async function answers(context: unknown, module: ModuleId): Promise<boolean> {
  if (isUnit(context)) return (await modulesOf(context))[module];
  if (hasSchool(context))
    return availableModules(context.school.entitlements).includes(module);
  return true;
}

export const router = {
  identifiers: owned("identifiers", identifiersSystem),
  identity: owned("identity", { ...identity, ...discovery }),
  people: owned("people", { ...peopleSystem, ...emergencyContactsSystem }),
  guardians: owned("guardians", guardiansSystem),
  badges: owned("badges", { ...badgesSystem, signIn: badgeSignIn }),
  access: owned("access", accessSystem),
  school: owned("school", schoolSystem),
  billing: owned("billing", billingSystem),
  records: owned("records", recordsSystem),
  classes: owned("classes", { ...classesSystem, ...classGroups }),
  homerooms: owned("homerooms", homeroomsSystem),
  gradeLevels: owned("gradeLevels", gradeLevelsSystem),
  consents: owned("consents", consentsSystem),
  years: owned("years", yearsSystem),
  schoolDays: owned("schoolDays", schoolDaysSystem),
  periods: owned("periods", periodsSystem),
  files: owned("files", filesSystem),
  documents: owned("documents", documentsSystem),
  comments: owned("comments", commentsSystem),
  templates: owned("templates", templatesSystem),
  bank: owned("bank", bankSystem),
  shared: owned("shared", sharedSystem),
  assistant: owned("assistant", assistantSystem),
  standards: owned("standards", standardsSystem),
  coursework: owned("coursework", {
    ...courseworkSystem,
    today: courseworkToday,
  }),
  peer: owned("peer", { ...peerSystem, settings: peerSettings }),
  reading: owned("reading", readingSystem),
  gradebook: owned("gradebook", {
    ...gradebookSystem,
    running,
    runningShown,
    showRunning,
    runningDefault,
    setRunningDefault,
  }),
  grading: owned("grading", gradingSystem),
  privacy: owned("privacy", privacySystem),
  attendance: owned("attendance", {
    ...attendanceSystem,
    today: attendanceToday,
    office: attendanceOffice,
  }),
  absenceReports: owned("absenceReports", absenceReportsSystem),
  followUp: owned("followUp", followUpSystem),
  familyShares: owned("familyShares", familySharesSystem),
  frontDesk: owned("frontDesk", frontDeskSystem),
  rollover: owned("rollover", rolloverSystem),
  timetable: owned("timetable", { ...timetableSystem, today: timetableToday }),
  cover: owned("cover", coverSystem),
  messages: owned("messages", messagesSystem),
  announcements: owned("announcements", announcementsSystem),
  calendar: owned("calendar", calendarSystem),
  notifications: owned("notifications", notificationsSystem),
  learning: owned("learning", { ...learningSystem, today: learningToday }),
  pictures: owned("pictures", picturesSystem),
  media: owned("media", mediaSystem),
  site: owned("site", {
    ...siteSystem,
    announcementPost,
    announcementOptions,
  }),
  admissions: owned("admissions", admissionsSystem),
  intakes: owned("intakes", intakesSystem),
  applications: owned("applications", applicationsSystem),
  applying: owned("applying", {
    ...applyingSystem,
    registration,
    applyAs,
  }),
  decisions: owned("decisions", decisionsSystem),
  product: owned("product", productSystem),
  hosts: owned("hosts", hostsSystem),
  home: owned("home", homeSystem),
  search: owned("search", searchSystem),
};
export type AppRouter = typeof router;
