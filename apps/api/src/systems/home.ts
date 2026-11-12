import type {
  OnboardingItem,
  SetupProgress,
} from "@faridalms/domain/onboarding";

import {
  announcementFeed,
  managedBroadcasts,
} from "@faridalms/database/stores/broadcasts";
import {
  classesTaughtBy,
  classLabels,
} from "@faridalms/database/stores/classes";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import { eventsBetween } from "@faridalms/database/stores/events";
import { expiringDocuments } from "@faridalms/database/stores/identifiers";
import { threadsOf, unreadThreads } from "@faridalms/database/stores/messages";
import { deliveryLog } from "@faridalms/database/stores/notifications";
import { namesOf } from "@faridalms/database/stores/persons";
import {
  preferenceOf,
  savePreference,
} from "@faridalms/database/stores/preferences";
import {
  person as readPerson,
  referenceOf,
} from "@faridalms/database/stores/students";
import {
  EXPIRY_WARNING_DAYS,
  SEALED_MEANINGS,
} from "@faridalms/domain/identifiers";
import { MODULE_IDS } from "@faridalms/domain/modules";
import {
  onboardingItems,
  SETUP_ITEMS,
  setupFinished,
  setupProgress,
} from "@faridalms/domain/onboarding";
import { addDays } from "@faridalms/domain/school";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import {
  firstAnnouncements,
  openedAnnouncements,
} from "../announcements/points";
import { reachAt } from "../core/audiences";
import { modulesOf } from "../core/modules";
import {
  can,
  localeOf,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { reachesStudent, scopeFor, studentsReached } from "../core/reach";
import { setupSeen } from "../core/setup";
import { studentGroupsOf } from "../core/student-groups";
import { decidesFor } from "../people/acting";
import { studentPlacesOf, youngStudentsOf } from "../people/points";

/**
 * A teacher's day as core keeps it: unread messages, what is happening this
 * week and their classes. Each module adds its own cards.
 */
export const teacher = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "classes:read");
  const [unread, threads, events, classes] = await Promise.all([
    unreadThreads(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
    }),
    threadsOf(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
      unreadOnly: true,
      q: "",
      limit: 3,
    }),
    eventsBetween(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
      drafts: false,
      from: context.today,
      to: addDays(context.today, 6),
      reach: await reachAt(context, {
        userId: context.actor.userId,
        on: context.today,
      }),
    }),
    classesTaughtBy(context.tx, context, {
      userId: context.actor.userId,
      on: context.today,
    }),
  ]);
  return {
    today: context.today,
    messages: { unread, threads: threads.rows },
    events: events.filter((event) => !event.cancelled).slice(0, 5),
    classes: classes.map((row) => ({
      id: row.id,
      code: row.code,
      titleEn: row.titleEn,
      titleAr: row.titleAr,
      students: row.students,
      role: row.role,
    })),
  };
});

/** A row's title in the reader's language, the other when it has none. */
function localTitle(
  context: UnitContext,
  row: { titleEn: string; titleAr: string },
) {
  return localeOf(context) === "ar"
    ? row.titleAr || row.titleEn
    : row.titleEn || row.titleAr;
}

/** The label of one of a list's choices, in both languages. */
function labelIn(
  list: readonly {
    id: string;
    labelEn: string | null;
    labelAr: string | null;
  }[],
  id: string | null | undefined,
) {
  const found = list.find((row) => row.id === id);
  return found ? { labelEn: found.labelEn, labelAr: found.labelAr } : null;
}

/**
 * What the school holds about one learner, for the learner or someone who
 * follows them to read and check: who they are, their number, where a
 * module places them and their class. It says whether the reader decides
 * for the learner, since only one who does may ask for a correction.
 */
export const details = readProcedure
  .input(v.object({ studentId: v.pipe(v.string(), v.uuid()) }))
  .handler(async ({ input, context }) => {
    const scope = scopeFor(context, "own");
    if (
      (input.studentId !== context.actor.userId &&
        !context.actor.follows.includes(input.studentId)) ||
      !(await reachesStudent(context, "own", input.studentId))
    )
      throw new ORPCError("NOT_FOUND");
    const [record, reference, places, groups, sexes] = await Promise.all([
      readPerson(context.tx, input.studentId),
      referenceOf(context.tx, scope, input.studentId),
      studentPlacesOf(context, [input.studentId], context.today),
      studentGroupsOf(context, [input.studentId], context.today),
      descriptorsFor(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        namespace: "sex",
        today: context.today,
      }),
    ]);
    if (!record) throw new ORPCError("NOT_FOUND");
    return {
      studentId: input.studentId,
      fullNameEn: record.fullNameEn,
      fullNameAr: record.fullNameAr,
      preferredGivenName: record.preferredGivenName,
      birthDate: record.birthDate,
      sex: labelIn(sexes, record.sexId),
      reference: reference?.identifier ?? null,
      place: places.get(input.studentId) ?? null,
      group: groups.get(input.studentId) ?? null,
      decides: await decidesFor(context, {
        userId: context.actor.userId,
        studentId: input.studentId,
        on: context.today,
      }),
    };
  });

/**
 * The home of someone who follows learners: the learners, unread messages
 * and the latest announcements, pinned first. Each module adds what it
 * says of each learner's day.
 */
export const followed = readProcedure
  .input(
    v.object({
      studentId: v.optional(
        v.union([v.literal(""), v.pipe(v.string(), v.uuid())]),
        "",
      ),
    }),
  )
  .handler(async ({ input, context }) => {
    requireCapability(context, "children:read");
    const reached = await studentsReached(
      context,
      "teaching",
      context.actor.follows,
    );
    const links = (
      await namesOf(
        context.tx,
        context.tenantId,
        context.actor.follows.filter((id) => reached.has(id)),
      )
    ).map((row) => ({
      studentId: row.id,
      fullNameEn: row.fullNameEn,
      fullNameAr: row.fullNameAr,
    }));
    if (
      input.studentId &&
      !links.some((link) => link.studentId === input.studentId)
    )
      throw new ORPCError("NOT_FOUND");
    const chosen = input.studentId
      ? links.filter((link) => link.studentId === input.studentId)
      : links;
    const [threads, unread, feed] = await Promise.all([
      threadsOf(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        viewerId: context.actor.userId,
        unreadOnly: true,
        q: "",
        limit: 3,
      }),
      unreadThreads(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        viewerId: context.actor.userId,
      }),
      announcementFeed(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        viewerId: context.actor.userId,
        opened: await openedAnnouncements(context),
        today: context.today,
        tab: "current",
        q: "",
        limit: 3,
        offset: 0,
      }).then(({ rows }) => rows),
    ]);
    const young = await youngStudentsOf(
      context,
      chosen.map((link) => link.studentId),
      context.today,
    );
    const children = chosen.map((link) => ({
      studentId: link.studentId,
      fullNameEn: link.fullNameEn,
      fullNameAr: link.fullNameAr,
      young: young.has(link.studentId),
    }));
    return {
      today: context.today,
      choices: links.map((link) => ({
        studentId: link.studentId,
        fullNameEn: link.fullNameEn,
        fullNameAr: link.fullNameAr,
      })),
      children,
      messages: { unread, threads: threads.rows },
      announcements: feed.map((row) => ({
        id: row.id,
        title: localTitle(context, row),
        summary:
          (localeOf(context) === "ar" ? row.excerptAr : row.excerptEn) ||
          row.excerptEn ||
          row.excerptAr ||
          row.summary,
        urgency: row.urgency,
        pinned: row.pinned,
        readAt: row.readAt,
      })),
    };
  });

/**
 * A student's home as core keeps it: class announcements and their
 * classes. Each module adds its own cards.
 */
export const student = readProcedure.handler(async ({ context }) => {
  if (context.actor.workspace !== "me") throw new ORPCError("FORBIDDEN");
  const studentId = context.actor.userId;
  const [reach, feed] = await Promise.all([
    reachAt(context, { userId: studentId, on: context.today }),
    announcementFeed(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: studentId,
      opened: await openedAnnouncements(context),
      today: context.today,
      tab: "current",
      q: "",
      limit: 3,
      offset: 0,
    }).then(({ rows }) => rows),
  ]);
  const classes = await classLabels(
    context.tx,
    context.tenantId,
    reach.classIds,
  );
  return {
    today: context.today,
    announcements: feed.slice(0, 3).map((row) => ({
      id: row.id,
      title: localTitle(context, row),
      summary: row.summary,
      urgency: row.urgency,
      readAt: row.readAt,
    })),
    classes: [...classes.values()],
  };
});

/**
 * The office's day as core keeps it: what needs action, the next week's
 * events, and recent communications with how many read them. Each module
 * adds its own needs and cards.
 */
export const admin = readProcedure.handler(async ({ context }) => {
  if (context.actor.profile !== "staff_admin") throw new ORPCError("FORBIDDEN");
  const events = (
    await eventsBetween(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      viewerId: context.actor.userId,
      drafts: false,
      from: context.today,
      to: addDays(context.today, 6),
      reach: null,
    })
  )
    .filter((event) => !event.cancelled)
    .slice(0, 6);
  const failed = can(context, "school:manage")
    ? (
        await deliveryLog(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          state: "failed",
          channel: "all",
          q: "",
          limit: 1,
          offset: 0,
        })
      ).total
    : null;
  const announcements = can(context, "announcements:manage")
    ? (
        await managedBroadcasts(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          tab: "published",
          q: "",
          first: await firstAnnouncements(context),
          limit: 3,
          offset: 0,
        })
      ).rows
        .slice(0, 3)
        .map((row) => ({
          id: row.id,
          title: localTitle(context, row),
          recipients: row.recipients,
          read: row.read,
        }))
    : [];
  const documents = can(context, "people:manage")
    ? (
        await expiringDocuments(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          today: context.today,
          until: addDays(context.today, EXPIRY_WARNING_DAYS),
          meanings: SEALED_MEANINGS,
        })
      ).slice(0, 5)
    : [];
  return {
    today: context.today,
    failed,
    documents,
    events,
    communications: announcements,
    onboarding: await onboardingFor(context),
  };
});

/** Where a person keeps the schools whose finished setup they have hidden. */
const ONBOARDING_HIDDEN = "home_onboarding";
const hiddenSchema = v.object({ schools: v.array(v.string()) });

async function hiddenSchools(context: UnitContext) {
  const kept = v.safeParse(
    hiddenSchema,
    await preferenceOf(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      key: ONBOARDING_HIDDEN,
    }),
  );
  return kept.success ? kept.output.schools : [];
}

/**
 * The school's first steps as its administrators see them, the same list
 * the operators follow: what the school's data shows now, with what the
 * directory holds of its address, its first invoice and the operators'
 * steps. The school's own setup comes first, step by step in the order it
 * is best done; the rest follows as it is reached. Gone once every step is
 * taken, or once the setup is finished and the person has hidden it.
 */
async function onboardingFor(context: UnitContext): Promise<{
  steps: SetupProgress[];
  items: { item: OnboardingItem; done: boolean }[];
  finished: boolean;
} | null> {
  const on = await modulesOf(context);
  const applies = onboardingItems({
    modules: MODULE_IDS.filter((module) => on[module]),
    onTrial: context.school.entitlements.trialEndsOn !== null,
  });
  const [seen, kept] = await Promise.all([
    setupSeen(context, context.today),
    context.directory.onboardingOf(context.schoolId),
  ]);
  const done = new Set<OnboardingItem>([
    ...seen,
    ...kept.map((row) => row.item),
  ]);
  if (applies.every((item) => done.has(item))) return null;
  const steps = setupProgress(applies, done);
  const finished = setupFinished(steps);
  if (finished && (await hiddenSchools(context)).includes(context.schoolId))
    return null;
  return {
    steps,
    items: applies
      .filter((item) => !SETUP_ITEMS.has(item))
      .map((item) => ({ item, done: done.has(item) })),
    finished,
  };
}

/**
 * Hides the school's first steps from the person's Today once the school's
 * own setup is finished; what is left is the operators' and the school's
 * first weeks, which the console follows.
 */
export const hideOnboarding = writeProcedure.handler(async ({ context }) => {
  if (context.actor.profile !== "staff_admin") throw new ORPCError("FORBIDDEN");
  const onboarding = await onboardingFor(context);
  if (onboarding && !onboarding.finished)
    throw new ORPCError("CONFLICT", { message: "onboarding.not_finished" });
  const schools = await hiddenSchools(context);
  if (!schools.includes(context.schoolId))
    await savePreference(context.tx, {
      tenantId: context.tenantId,
      userId: context.actor.userId,
      key: ONBOARDING_HIDDEN,
      value: { schools: [...schools, context.schoolId] },
    });
  return { hidden: true };
});
