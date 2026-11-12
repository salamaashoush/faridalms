import type { Filling } from "~/utils/extension";

import { classTitle } from "~/components/classes/format";
import { HomeCard } from "~/components/home/parts";
import {
  childDayParts,
  learnerCards,
  teacherCards,
} from "~/components/home/slots";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { timetableTodayQuery } from "~/queries/timetable";
import { fill } from "~/utils/extension";

import type { Slot } from "./Lessons";

import { Lessons } from "./Lessons";
import { lessonRegisters } from "./slots";

type Read = { today: string; slots: Slot[] };

const reads = (capabilities: readonly string[]) =>
  capabilities.includes("timetable:read");

const lesson = (slot: Slot | undefined, label: string) =>
  slot
    ? `${label}: ${classTitle({ code: slot.classCode, titleEn: slot.classTitleEn, titleAr: slot.classTitleAr })}`
    : null;

interface TeachingLessonsProps {
  today: string;
  slots: Slot[];
}

/** A teacher's lessons today, opening where their registers are kept, or else the timetable. */
function TeachingLessons({ today, slots }: TeachingLessonsProps) {
  const registers = useSlot(lessonRegisters)[0];
  return (
    <HomeCard
      title={m.homeLessonsToday()}
      action={
        registers
          ? { label: registers.action.label(), link: registers.action.link }
          : {
              label: m.homeOpenTimetable(),
              link: { to: "/timetable", search: {} },
            }
      }
    >
      <Lessons slots={slots} registerDate={today} />
    </HomeCard>
  );
}

/** The timetable's lessons on Today: a teacher's with their registers, a learner's, and a child's now and next. */
export const TIMETABLE_TODAY: Filling[] = [
  fill(teacherCards, {
    key: "lessons",
    place: 10,
    area: "main",
    query: (capabilities) =>
      reads(capabilities) ? timetableTodayQuery() : null,
    cardOf: (read) => {
      const { today, slots } = read as Read;
      if (slots.length === 0) return null;
      return <TeachingLessons key="lessons" today={today} slots={slots} />;
    },
  }),
  fill(learnerCards, {
    key: "lessons",
    place: 20,
    area: "main",
    query: (capabilities) =>
      reads(capabilities) ? timetableTodayQuery() : null,
    cardOf: (read) => {
      const { slots } = read as Read;
      if (slots.length === 0) return null;
      return (
        <HomeCard
          key="lessons"
          title={m.homeLessonsToday()}
          action={{
            label: m.homeOpenTimetable(),
            link: { to: "/me/timetable", search: {} },
          }}
        >
          <Lessons slots={slots} showTeacher />
        </HomeCard>
      );
    },
  }),
  fill(childDayParts, {
    key: "lessons",
    place: 10,
    query: (studentId, capabilities) =>
      reads(capabilities) ? timetableTodayQuery(studentId) : null,
    dayOf: (read) => {
      const { slots } = read as Read;
      return {
        lines: [
          lesson(
            slots.find((slot) => slot.when === "now"),
            m.homeNow(),
          ),
          lesson(
            slots.find((slot) => slot.when === "next"),
            m.homeNext(),
          ),
        ].filter((line) => line !== null),
      };
    },
  }),
];
