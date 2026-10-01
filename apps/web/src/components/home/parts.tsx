import type { LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { cn } from "@faridalms/ui/cn";
import { Link } from "@tanstack/react-router";

import type { Tone } from "~/components/system/status";

import { classTitle } from "~/components/classes/format";
import {
  phoneLink,
  RecordList,
  RecordSection,
} from "~/components/system/RecordPage";
import { StatusBadge, StatusText } from "~/components/system/status";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

export const itemLink = cn(
  "justify-self-start text-sm leading-5 font-medium hover:text-primary hover:underline",
  phoneLink,
);

/**
 * One card of a home page: what it is about, a short list, and the one thing
 * to do about it. A card with nothing in it is not shown at all.
 */
export function HomeCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: ReactNode;
  action?: { label: string; link: LinkProps };
  children: ReactNode;
}) {
  return (
    <RecordSection
      title={title}
      description={description}
      action={
        action ? (
          <Link
            {...action.link}
            className={cn(
              "inline-flex min-h-8 items-center px-2 text-sm font-medium text-primary underline-offset-4 hover:underline",
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

export function HomeList({ children }: { children: ReactNode }) {
  return <RecordList>{children}</RecordList>;
}

export function HomeItem({
  title,
  facts,
  status,
}: {
  title: ReactNode;
  facts?: (string | null | undefined)[];
  status?: ReactNode;
}) {
  const shown = (facts ?? []).filter(Boolean);
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-3">
      <div className="grid min-w-0 gap-0.5">
        {title}
        {shown.length ? (
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {shown.join(" · ")}
          </span>
        ) : null}
      </div>
      {status}
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
  teacherNameEn: string | null;
  teacherNameAr: string | null;
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

/** `08:30` as the reader's clock shows it. */
export function formatClock(time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return new Intl.DateTimeFormat(getLocale(), {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2000, 0, 1, hours, minutes)));
}

/**
 * A day's lessons in order, the one on now and the next one marked. For a
 * teacher each lesson with a register links to it.
 */
export function Lessons({
  slots,
  registerDate,
  showTeacher = false,
}: {
  slots: Slot[];
  /** The day to open registers on; without it lessons do not link to registers. */
  registerDate?: string;
  showTeacher?: boolean;
}) {
  return (
    <HomeList>
      {slots.map((slot) => {
        const period =
          inLocale(slot.periodNameEn, slot.periodNameAr) || slot.periodCode;
        const time =
          slot.startTime && slot.endTime
            ? `${formatClock(slot.startTime)}–${formatClock(slot.endTime)}`
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
              showTeacher
                ? inLocale(slot.teacherNameEn, slot.teacherNameAr)
                : null,
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
