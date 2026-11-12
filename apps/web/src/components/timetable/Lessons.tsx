import { StatusBadge, StatusText } from "@faridalms/ui/system/status";
import { Link } from "@tanstack/react-router";

import type { RecordLink } from "~/components/people/PersonLink";

import { classTitle } from "~/components/classes/format";
import { HomeItem, HomeList, itemLink } from "~/components/home/parts";
import { PersonLink } from "~/components/people/PersonLink";
import { inLocale } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { formatTime } from "~/utils/datetime";

import type { RegisterState } from "./slots";

import { lessonRegisters } from "./slots";

export interface Slot {
  periodId: string;
  periodCode: string;
  periodNameEn: string | null;
  periodNameAr: string | null;
  startTime: string | null;
  endTime: string | null;
  classId: string;
  classCode: string;
  classTitleEn: string | null;
  classTitleAr: string | null;
  roomCode: string | null;
  teacherId: string | null;
  teacherNameEn: string | null;
  teacherNameAr: string | null;
  teacherLink: RecordLink;
  when: "now" | "next" | null;
  register: RegisterState | null;
}

export interface LessonsProps {
  slots: Slot[];
  /** The day to open registers on; without it lessons do not link to registers. */
  registerDate?: string;
  showTeacher?: boolean;
}

/**
 * A day's lessons in order, the one on now and the next one marked. For a
 * teacher each lesson with a register links to it, where a module keeps
 * registers.
 */
export function Lessons({
  slots,
  registerDate,
  showTeacher = false,
}: LessonsProps) {
  const registers = useSlot(lessonRegisters)[0];
  return (
    <HomeList>
      {slots.map((slot) => {
        const period =
          inLocale(slot.periodNameEn, slot.periodNameAr) || slot.periodCode;
        const time =
          slot.startTime && slot.endTime
            ? `${formatTime(slot.startTime)}–${formatTime(slot.endTime)}`
            : null;
        const name = classTitle({
          code: slot.classCode,
          titleEn: slot.classTitleEn,
          titleAr: slot.classTitleAr,
        });
        const register =
          registers && slot.register ? registers.states[slot.register] : null;
        return (
          <HomeItem
            key={`${slot.periodId}-${slot.classId}`}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {registers && registerDate && slot.register ? (
                  <Link
                    {...registers.linkOf({
                      classId: slot.classId,
                      periodId: slot.periodId,
                      date: registerDate,
                    })}
                    className={itemLink}
                  >
                    <bdi>{name}</bdi>
                  </Link>
                ) : (
                  <bdi className="text-sm leading-5 font-medium">{name}</bdi>
                )}
                {slot.when ? (
                  <StatusBadge
                    tone={slot.when === "now" ? "accent" : "neutral"}
                  >
                    {slot.when === "now" ? m.homeNow() : m.homeNext()}
                  </StatusBadge>
                ) : null}
              </span>
            }
            facts={[
              period,
              time,
              slot.roomCode ? m.homeRoom({ room: slot.roomCode }) : null,
              showTeacher && slot.teacherId ? (
                <PersonLink
                  key="teacher"
                  userId={slot.teacherId}
                  link={slot.teacherLink}
                  className="underline-offset-2 hover:text-foreground hover:underline focus-visible:underline"
                >
                  <bdi>{inLocale(slot.teacherNameEn, slot.teacherNameAr)}</bdi>
                </PersonLink>
              ) : null,
            ]}
            status={
              register ? (
                <StatusText tone={register.tone}>{register.label()}</StatusText>
              ) : undefined
            }
          />
        );
      })}
    </HomeList>
  );
}
