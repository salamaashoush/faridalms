import { Link } from "@tanstack/react-router";
import { Layers } from "lucide-react";

import type { getLearnerModules } from "~/server/learning";

import { SubjectIcon } from "~/components/app/labels";
import { EmptyState, Value } from "~/components/app/primitives";
import { subjectLabel } from "~/components/family/format";
import { Progress } from "~/components/ui/progress";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

type LearnerModule = Awaited<
  ReturnType<typeof getLearnerModules>
>["rows"][number];

export function ModuleList({
  rows,
  studentId,
}: {
  rows: LearnerModule[];
  studentId: string;
}) {
  if (rows.length === 0)
    return <EmptyState icon={Layers} title={m.learningNoModules()} />;
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => {
        const percent =
          row.lessonsTotal === 0
            ? 0
            : Math.round((row.lessonsCompleted / row.lessonsTotal) * 100);
        return (
          <li
            key={row.id}
            className="flex flex-col rounded-xl border bg-card p-5"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <SubjectIcon icon={row.subject?.icon ?? ""} />
              <Value>{subjectLabel(row.subject)}</Value>
              <span aria-hidden>·</span>
              <Value>{row.class?.name}</Value>
            </div>
            <h2 className="mt-2 text-lg font-semibold">
              <Link
                to="/modules/$moduleId"
                params={{ moduleId: row.id }}
                search={{ studentId }}
                className="hover:text-primary hover:underline"
              >
                {row.title}
              </Link>
            </h2>
            {row.summary ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {row.summary}
              </p>
            ) : null}
            <div className="mt-auto pt-4">
              <Progress
                value={percent}
                aria-label={m.learningProgress({
                  done: formatNumber(row.lessonsCompleted),
                  total: formatNumber(row.lessonsTotal),
                })}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                {m.learningProgress({
                  done: formatNumber(row.lessonsCompleted),
                  total: formatNumber(row.lessonsTotal),
                })}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
