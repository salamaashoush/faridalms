import { Progress } from "@faridalms/ui/progress";
import { Link } from "@tanstack/react-router";
import { BookOpen, Play } from "lucide-react";

import type { Filling } from "~/utils/extension";

import { HomeCard, itemLink } from "~/components/home/parts";
import { learnerCards, youngTasks } from "~/components/home/slots";
import * as m from "~/i18n/messages";
import { learningTodayQuery, nextLessonsQuery } from "~/queries/learning";
import { formatNumber } from "~/utils/datetime";
import { fill } from "~/utils/extension";

type Read = Awaited<ReturnType<(typeof learningTodayQuery)["queryFn"]>>;
type Next = Awaited<ReturnType<(typeof nextLessonsQuery)["queryFn"]>>;

/** E-learning on a student's Today: the module to pick up again. */
export const ELEARNING_TODAY: Filling[] = [
  fill(learnerCards, {
    key: "module",
    place: 10,
    area: "side",
    query: (capabilities) =>
      capabilities.includes("learning:read") ? learningTodayQuery : null,
    cardOf: (read) => {
      const { module } = read as Read;
      if (!module) return null;
      return (
        <HomeCard key="module" title={m.homeContinue()}>
          <div className="grid gap-3">
            <Link
              to="/modules/$moduleId"
              params={{ moduleId: module.id }}
              search={{}}
              className={itemLink}
            >
              <span className="inline-flex items-center gap-2">
                <Play aria-hidden className="size-4" />
                <bdi>{module.title}</bdi>
              </span>
            </Link>
            <Progress
              value={(module.completed / module.lessons) * 100}
              aria-label={m.lrnProgressOf({ title: module.title })}
              className="gap-1"
            >
              <span className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
                {m.lrnDoneOf({
                  count: formatNumber(module.completed),
                  total: formatNumber(module.lessons),
                })}
              </span>
            </Progress>
          </div>
        </HomeCard>
      );
    },
  }),
  fill(youngTasks, {
    place: 10,
    query: (capabilities) =>
      capabilities.includes("learning:read") ? nextLessonsQuery : null,
    tasksOf: (read) =>
      (read as Next).lessons.map((lesson) => ({
        key: lesson.lessonId,
        title: lesson.title,
        subtitle: lesson.moduleTitle,
        toneOf: lesson.moduleId,
        icon: BookOpen,
        begun: lesson.begun,
        link: {
          to: "/lessons/$lessonId" as const,
          params: { lessonId: lesson.lessonId },
        },
      })),
  }),
];
