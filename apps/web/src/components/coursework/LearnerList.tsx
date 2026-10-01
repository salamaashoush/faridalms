import type { LearnerState } from "@faridalms/domain/coursework";
import type { GradeView } from "@faridalms/domain/grading";

import { cn } from "@faridalms/ui/cn";
import { Link } from "@tanstack/react-router";

import {
  phoneLink,
  RecordEmpty,
  RecordList,
  RecordSection,
} from "~/components/system/RecordPage";
import { StatusText } from "~/components/system/status";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

import { classTitle } from "../classes/format";
import { resultText } from "../grading/format";
import { formatInstant, STATE_LABEL, STATE_TONE } from "./format";

export interface LearnerItem {
  assignmentId: string;
  title: string;
  classCode: string;
  classTitleEn: string | null;
  classTitleAr: string | null;
  dueAt: string | null;
  points: number | null;
  effectiveScore: number | null;
  /** Absent where the list comes from a view that grades nothing. */
  grade?: GradeView | null;
  releasedAt: string | null;
  state: LearnerState;
}

export const TO_DO: readonly LearnerState[] = [
  "to_do",
  "in_progress",
  "needs_revision",
];
export const DONE: readonly LearnerState[] = [
  "handed_in",
  "handed_in_late",
  "returned",
  "excused",
];

function dayKey(iso: string | null, timeZone: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}

function dayLabel(key: string) {
  if (!key) return m.courseworkNoDueDate();
  return new Intl.DateTimeFormat(getLocale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${key}T00:00:00Z`));
}

function Item({
  item,
  timeZone,
  linked,
}: {
  item: LearnerItem;
  timeZone: string;
  linked: boolean;
}) {
  const facts = [
    classTitle({
      code: item.classCode,
      titleEn: item.classTitleEn,
      titleAr: item.classTitleAr,
    }),
    item.dueAt
      ? m.courseworkDueOn({ date: formatInstant(item.dueAt, timeZone) })
      : null,
    item.state === "returned" && item.effectiveScore !== null
      ? resultText(item.grade, item.effectiveScore, item.points, "learner")
      : null,
  ].filter(Boolean);
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-3">
      <div className="grid min-w-0 gap-0.5">
        {linked ? (
          <Link
            to="/assignments/$assignmentId"
            params={{ assignmentId: item.assignmentId }}
            search={{}}
            className={cn(
              "justify-self-start text-sm leading-5 font-medium hover:text-primary hover:underline",
              phoneLink,
            )}
          >
            <bdi>{item.title}</bdi>
          </Link>
        ) : (
          <bdi className="text-sm leading-5 font-medium">{item.title}</bdi>
        )}
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {facts.join(" · ")}
        </span>
      </div>
      <StatusText tone={STATE_TONE[item.state]}>
        {STATE_LABEL[item.state]()}
      </StatusText>
    </li>
  );
}

/** Work grouped under the day it is due, earliest first. */
export function ByDay({
  items,
  timeZone,
  linked,
  empty,
}: {
  items: LearnerItem[];
  timeZone: string;
  linked: boolean;
  empty: string;
}) {
  if (items.length === 0) return <RecordEmpty>{empty}</RecordEmpty>;
  const days = new Map<string, LearnerItem[]>();
  for (const item of items) {
    const key = dayKey(item.dueAt, timeZone);
    days.set(key, [...(days.get(key) ?? []), item]);
  }
  return (
    <div className="grid gap-6">
      {[...days.entries()].map(([key, group]) => (
        <RecordSection key={key || "none"} title={dayLabel(key)}>
          <RecordList>
            {group.map((item) => (
              <Item
                key={item.assignmentId}
                item={item}
                timeZone={timeZone}
                linked={linked}
              />
            ))}
          </RecordList>
        </RecordSection>
      ))}
    </div>
  );
}

export function WorkSection({
  title,
  items,
  timeZone,
  linked,
  empty,
}: {
  title: string;
  items: LearnerItem[];
  timeZone: string;
  linked: boolean;
  empty: string;
}) {
  return (
    <RecordSection title={title}>
      {items.length === 0 ? (
        <RecordEmpty>{empty}</RecordEmpty>
      ) : (
        <RecordList>
          {items.map((item) => (
            <Item
              key={item.assignmentId}
              item={item}
              timeZone={timeZone}
              linked={linked}
            />
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}
