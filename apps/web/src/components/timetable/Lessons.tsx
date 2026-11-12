import type { Tone } from "@faridalms/ui/system/status";

import { StatusBadge, StatusText } from "@faridalms/ui/system/status";
import { Link } from "@tanstack/react-router";

import type { RecordLink } from "~/components/people/PersonLink";

import { classTitle } from "~/components/classes/format";
import { HomeItem, HomeList, itemLink } from "~/components/home/parts";
import { PersonLink } from "~/components/people/PersonLink";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatTime } from "~/utils/datetime";

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
  register: "not_started" | "in_progress" | "submitted" | null;
}

const REGISTER: Record<
  "not_started" | "in_progress" | "submitted",
  { label: () => string; tone: Tone }
> = {
  not_started: { label: m.homeRegisterNotTaken, tone: "warning" },
  in_progress: { label: m.homeRegisterInProgress, tone: "info" },
  submitted: { label: m.homeRegisterTaken, tone: "success" },
};

export interface LessonsProps {
  slots: Slot[];
  /** The day to open registers on; without it lessons do not link to registers. */
  registerDate?: string;
  showTeacher?: boolean;
}

/**
 * A day's lessons in order, the one on now and the next one marked. For a
 * teacher each lesson with a register links to it.
 */
export function Lessons({
  slots,
  registerDate,
  showTeacher = false,
}: LessonsProps) {
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
        const register = slot.register ? REGISTER[slot.register] : null;
        return (
          <HomeItem
            key={`${slot.periodId}-${slot.classId}`}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {registerDate && slot.register ? (
                  <Link
                    to="/registers/$classId"
                    params={{ classId: slot.classId }}
                    search={{ date: registerDate, periodId: slot.periodId }}
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
