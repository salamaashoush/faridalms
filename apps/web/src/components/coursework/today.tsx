import { StatusText } from "@faridalms/ui/system/status";
import { Link } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";

import type { Filling } from "~/utils/extension";

import { classTitle } from "~/components/classes/format";
import {
  HomeCard,
  HomeItem,
  HomeList,
  itemLink,
} from "~/components/home/parts";
import {
  childDayParts,
  learnerCards,
  teacherCards,
  youngTasks,
} from "~/components/home/slots";
import * as m from "~/i18n/messages";
import { courseworkTodayQuery } from "~/queries/coursework";
import { formatInstant, formatNumber } from "~/utils/datetime";
import { fill } from "~/utils/extension";

import { STATE_LABEL, STATE_TONE } from "./format";

type Read = Awaited<
  ReturnType<ReturnType<typeof courseworkTodayQuery>["queryFn"]>
>;

const teaches = (capabilities: readonly string[]) =>
  capabilities.includes("assignments:author") ||
  capabilities.includes("submissions:grade");

const classOf = (row: {
  classCode: string;
  classTitleEn: string | null;
  classTitleAr: string | null;
}) =>
  classTitle({
    code: row.classCode,
    titleEn: row.classTitleEn,
    titleAr: row.classTitleAr,
  });

/** Coursework on Today: what a teacher has to mark and is due, a student's work due, and a child's. */
export const COURSEWORK_TODAY: Filling[] = [
  fill(teacherCards, {
    key: "review",
    place: 20,
    area: "main",
    query: (capabilities) =>
      teaches(capabilities) ? courseworkTodayQuery() : null,
    cardOf: (read) => {
      const data = read as Read;
      if (data.review.length === 0) return null;
      return (
        <HomeCard
          key="review"
          title={m.homeToReview()}
          description={m.homeToReviewCount({ count: data.reviewTotal })}
          action={{
            label: m.homeOpenToReview(),
            link: { to: "/grading", search: {} },
          }}
        >
          <HomeList>
            {data.review.map((row) => (
              <HomeItem
                key={row.id}
                title={
                  <Link
                    to="/assignments/$assignmentId"
                    params={{ assignmentId: row.id }}
                    search={{ tab: "work" }}
                    className={itemLink}
                  >
                    <bdi>{row.title}</bdi>
                  </Link>
                }
                facts={[classOf(row)]}
                status={
                  <StatusText tone="warning">
                    {m.homeToGradeCount({ count: row.toGrade })}
                  </StatusText>
                }
              />
            ))}
          </HomeList>
        </HomeCard>
      );
    },
  }),
  fill(teacherCards, {
    key: "due",
    place: 30,
    area: "main",
    query: (capabilities) =>
      teaches(capabilities) ? courseworkTodayQuery() : null,
    cardOf: (read) => {
      const data = read as Read;
      if (data.due.length === 0) return null;
      return (
        <HomeCard
          key="due"
          title={m.homeDueThisWeek()}
          action={{
            label: m.homeOpenCoursework(),
            link: { to: "/assignments", search: {} },
          }}
        >
          <HomeList>
            {data.due.map((row) => (
              <HomeItem
                key={row.id}
                title={
                  <Link
                    to="/assignments/$assignmentId"
                    params={{ assignmentId: row.id }}
                    search={{}}
                    className={itemLink}
                  >
                    <bdi>{row.title}</bdi>
                  </Link>
                }
                facts={[
                  classOf(row),
                  row.dueAt ? formatInstant(row.dueAt) : null,
                ]}
                status={
                  <span className="text-[13px] text-muted-foreground tabular-nums">
                    {m.homeHandedInOf({
                      count: formatNumber(row.handedIn),
                      total: formatNumber(row.recipients),
                    })}
                  </span>
                }
              />
            ))}
          </HomeList>
        </HomeCard>
      );
    },
  }),
  fill(learnerCards, {
    key: "due",
    place: 10,
    area: "main",
    query: (capabilities) =>
      capabilities.includes("own-work:read") ? courseworkTodayQuery() : null,
    cardOf: (read) => {
      const { work } = read as Read;
      const due = [
        ...work.filter((row) => row.state === "missing"),
        ...work.filter(
          (row) =>
            row.dueThisWeek &&
            ["to_do", "in_progress", "needs_revision"].includes(row.state),
        ),
      ].slice(0, 5);
      if (due.length === 0) return null;
      return (
        <HomeCard
          key="due"
          title={m.homeDueSoon()}
          action={{
            label: m.homeOpenToDo(),
            link: { to: "/me/assignments", search: {} },
          }}
        >
          <HomeList>
            {due.map((row) => (
              <HomeItem
                key={row.assignmentId}
                title={
                  <Link
                    to="/assignments/$assignmentId"
                    params={{ assignmentId: row.assignmentId }}
                    search={{}}
                    className={itemLink}
                  >
                    <bdi>{row.title}</bdi>
                  </Link>
                }
                facts={[
                  classOf(row),
                  row.dueAt ? formatInstant(row.dueAt) : null,
                ]}
                status={
                  <StatusText tone={STATE_TONE[row.state]}>
                    {STATE_LABEL[row.state]()}
                  </StatusText>
                }
              />
            ))}
          </HomeList>
        </HomeCard>
      );
    },
  }),
  fill(childDayParts, {
    key: "work",
    place: 30,
    query: (studentId, capabilities) =>
      capabilities.includes("children:read")
        ? courseworkTodayQuery(studentId)
        : null,
    dayOf: (read, child) => {
      const { work } = read as Read;
      const search = { studentId: child.studentId };
      const due = work
        .filter(
          (row) =>
            row.dueThisWeek &&
            (row.state === "to_do" || row.state === "in_progress"),
        )
        .slice(0, 5);
      return {
        attention: [
          ...work
            .filter((row) => row.state === "missing")
            .map((row) => ({
              key: `missing-${row.assignmentId}`,
              rank: 20,
              label: m.homeAttentionMissing({ title: row.title }),
              link: { to: "/family/assignments" as const, search },
              fact: classOf(row),
            })),
          ...work
            .filter((row) => row.newResult)
            .map((row) => ({
              key: `result-${row.assignmentId}`,
              rank: 30,
              label: m.homeAttentionResult({ title: row.title }),
              link: { to: "/family/grades" as const, search },
              fact: classOf(row),
            })),
        ],
        sections:
          due.length > 0
            ? [
                {
                  key: "due",
                  title: m.homeDueThisWeek(),
                  items: due.map((row) => ({
                    key: row.assignmentId,
                    title: (
                      <bdi className="text-sm leading-5 font-medium">
                        {row.title}
                      </bdi>
                    ),
                    facts: [
                      classOf(row),
                      row.dueAt ? formatInstant(row.dueAt) : null,
                    ],
                  })),
                },
              ]
            : [],
      };
    },
  }),
  fill(youngTasks, {
    place: 20,
    query: (capabilities) =>
      capabilities.includes("own-work:read") ? courseworkTodayQuery() : null,
    tasksOf: (read) =>
      [
        ...(read as Read).work.filter((row) => row.state === "missing"),
        ...(read as Read).work.filter(
          (row) =>
            row.dueThisWeek &&
            ["to_do", "in_progress", "needs_revision"].includes(row.state),
        ),
      ]
        .slice(0, 5)
        .map((work) => ({
          key: work.assignmentId,
          title: work.title,
          subtitle: m.homeYoungToDo(),
          toneOf: work.assignmentId,
          icon: ClipboardList,
          begun: work.state === "in_progress",
          link: {
            to: "/assignments/$assignmentId" as const,
            params: { assignmentId: work.assignmentId },
          },
        })),
  }),
];
