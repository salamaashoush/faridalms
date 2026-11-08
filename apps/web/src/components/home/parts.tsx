import type { Tone } from "@faridalms/ui/system/status";
import type { LinkProps } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";

import { cn } from "@faridalms/ui/cn";
import {
  phoneLink,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { StatusBadge, StatusText } from "@faridalms/ui/system/status";
import { Link } from "@tanstack/react-router";

import type { RecordLink } from "~/components/people/PersonLink";

import { classTitle } from "~/components/classes/format";
import { PersonLink } from "~/components/people/PersonLink";
import { UserText } from "~/components/system/UserText";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatTime } from "~/utils/datetime";

export const itemLink = cn(
  "justify-self-start text-sm leading-5 font-medium hover:text-primary hover:underline",
  phoneLink,
);

/** One side of a staff member's day: its cards, in the order they matter. */
export interface DayCards {
  today: string;
  main: ReactNode[];
  aside: ReactNode[];
}

export interface HomeCardProps {
  title: string;
  description?: ReactNode;
  action?: { label: string; link: LinkProps };
  children: ReactNode;
}

/**
 * One card of a home page: what it is about, a short list, and the one thing
 * to do about it. A card with nothing in it is not shown at all.
 */
export function HomeCard({
  title,
  description,
  action,
  children,
}: HomeCardProps) {
  return (
    <RecordSection
      title={title}
      description={description}
      action={
        action ? (
          <Link
            {...action.link}
            className={cn(
              "inline-flex min-h-8 items-center rounded-md px-2 text-sm font-medium text-primary underline-offset-4 hover:underline",
              phoneLink,
            )}
          >
            {action.label}
          </Link>
        ) : undefined
      }
    >
      {children}
    </RecordSection>
  );
}

export interface HomeListProps {
  children: ReactNode;
}

export function HomeList({ children }: HomeListProps) {
  return <RecordList>{children}</RecordList>;
}

export interface HomeItemProps {
  title: ReactNode;
  /** Short facts; one that is an element, such as a link, carries its own key. */
  facts?: (string | ReactElement | null | undefined)[];
  summary?: string;
  status?: ReactNode;
}

export function HomeItem({ title, facts, summary, status }: HomeItemProps) {
  const shown = (facts ?? []).filter((fact): fact is string | ReactElement =>
    Boolean(fact),
  );
  // The title's first line and the status share one row box, as tall as
  // the title's link is on a phone, so the two line up.
  const row = "flex min-h-5 items-center max-md:min-h-10";
  return (
    <li className="flex items-start justify-between gap-x-4 py-3">
      <div className="grid min-w-0 gap-0.5">
        <div className={row}>{title}</div>
        {shown.length ? (
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {shown.map((fact, index) => (
              <span key={typeof fact === "string" ? fact : String(fact.key)}>
                {index ? " · " : null}
                <span className="whitespace-nowrap">{fact}</span>
              </span>
            ))}
          </span>
        ) : null}
        {summary ? (
          <UserText
            text={summary}
            lines={2}
            className="text-[13px] leading-[18px] text-muted-foreground"
          />
        ) : null}
      </div>
      {status ? <div className={cn(row, "shrink-0")}>{status}</div> : null}
    </li>
  );
}

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
