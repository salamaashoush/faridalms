import type { LearnerState } from "@faridalms/domain/coursework";
import type { GradeView } from "@faridalms/domain/grading";
import type { ContentLocale } from "@faridalms/domain/translations";

import { otherLocale } from "@faridalms/domain/translations";
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
import { formatDate, formatInstant, schoolDayOf } from "~/utils/datetime";

import { classTitle } from "../classes/format";
import { resultText } from "../grading/format";
import { STATE_LABEL, STATE_TONE } from "./format";

export interface LearnerItem {
  assignmentId: string;
  title: string;
  /** The language the brief is written in, and its title in the other where it has one. */
  language?: ContentLocale | null;
  translationTitle?: string | null;
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

/** The work's title in the reader's language, where its brief is translated into it. */
const titleOf = (item: LearnerItem) =>
  item.language &&
  item.translationTitle &&
  getLocale() === otherLocale(item.language)
    ? item.translationTitle
    : item.title;

function dayLabel(key: string) {
  return key ? formatDate(key, "weekday") : m.courseworkNoDueDate();
}

function Item({
  item,
  linked,
  onOpen,
}: {
  item: LearnerItem;
  linked: boolean;
  onOpen?: (item: LearnerItem) => void;
}) {
  const facts = [
    classTitle({
      code: item.classCode,
      titleEn: item.classTitleEn,
      titleAr: item.classTitleAr,
    }),
    item.dueAt ? m.courseworkDueOn({ date: formatInstant(item.dueAt) }) : null,
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
            <bdi>{titleOf(item)}</bdi>
          </Link>
        ) : onOpen ? (
          <button
            type="button"
            onClick={() => onOpen(item)}
            className={cn(
              "justify-self-start text-start text-sm leading-5 font-medium hover:text-primary hover:underline focus-visible:underline focus-visible:outline-none",
              phoneLink,
            )}
          >
            <bdi>{titleOf(item)}</bdi>
          </button>
        ) : (
          <bdi className="text-sm leading-5 font-medium">{titleOf(item)}</bdi>
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
  linked,
  empty,
}: {
  items: LearnerItem[];
  linked: boolean;
  empty: string;
}) {
  if (items.length === 0) return <RecordEmpty>{empty}</RecordEmpty>;
  const days = new Map<string, LearnerItem[]>();
  for (const item of items) {
    const key = item.dueAt ? schoolDayOf(item.dueAt) : "";
    days.set(key, [...(days.get(key) ?? []), item]);
  }
  return (
    <div className="grid gap-6">
      {[...days.entries()].map(([key, group]) => (
        <RecordSection key={key || "none"} title={dayLabel(key)}>
          <RecordList>
            {group.map((item) => (
              <Item key={item.assignmentId} item={item} linked={linked} />
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
  linked,
  onOpen,
  empty,
}: {
  title: string;
  items: LearnerItem[];
  linked: boolean;
  /** Opens a piece where the list does not link to it, as a family's does. */
  onOpen?: (item: LearnerItem) => void;
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
              linked={linked}
              onOpen={onOpen}
            />
          ))}
        </RecordList>
      )}
    </RecordSection>
  );
}
