import { cn } from "@faridalms/ui/cn";
import { useSuspenseQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Play, Star } from "lucide-react";

import { ReadAloud } from "~/components/learning/ReadAloud";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";

import { youngTasks } from "./slots";

// A colour per module, so a child finds the same subject by its colour.
const TONES = [
  "bg-primary/15 text-primary",
  "bg-info/15 text-info",
  "bg-success/15 text-success",
  "bg-warning/20 text-warning-foreground dark:text-warning",
];

function toneOf(id: string): string {
  let sum = 0;
  for (let index = 0; index < id.length; index++) sum += id.charCodeAt(index);
  return TONES[sum % TONES.length] ?? "";
}

/**
 * A young child's home: a few big cards for what to do next, the lesson
 * they began first and marked to go on with, each with a speaker that reads
 * its name. No messages, grades or counts; nothing starts by itself.
 */
export function YoungHome() {
  const user = useCurrentUser();
  const asked = useSlot(youngTasks).flatMap((part) => {
    const query = part.query(user.capabilities);
    return query ? [{ part, query }] : [];
  });
  const reads = useSuspenseQueries({
    queries: asked.map((row) => row.query),
  });
  const tasks = asked
    .toSorted((a, b) => a.part.place - b.part.place)
    .flatMap((row) =>
      row.part
        .tasksOf(reads[asked.indexOf(row)]?.data)
        .map((task) => ({ ...task, tone: toneOf(task.toneOf) })),
    )
    .slice(0, 6);
  const greeting = m.homeYoungHello({ name: user.name.split(" ")[0] ?? "" });
  return (
    <div className="mx-auto grid w-full max-w-4xl gap-8 py-4">
      <div className="flex items-center gap-4">
        <ReadAloud text={greeting} size="large" />
        <h1 dir="auto" className="text-3xl leading-tight font-bold sm:text-4xl">
          {greeting}
        </h1>
      </div>
      {tasks.length === 0 ? (
        <div className="grid justify-items-center gap-4 rounded-3xl bg-muted/50 px-6 py-12 text-center">
          <span className="grid size-24 place-items-center rounded-full bg-success/15 text-success">
            <Star aria-hidden className="size-12 fill-current" />
          </span>
          <p className="text-2xl leading-9 font-semibold">
            {m.homeYoungAllDone()}
          </p>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task, index) => {
            const first = index === 0 && task.begun;
            const Icon = first ? Play : task.icon;
            return (
              <li key={task.key} className="relative">
                <Link
                  {...task.link}
                  search={{}}
                  className={cn(
                    "grid min-h-52 touch-manipulation content-between gap-4 rounded-3xl border-2 bg-card p-5 shadow-sm outline-none select-none hover:border-primary/50 focus-visible:ring-4 focus-visible:ring-ring/50",
                    first && "border-primary",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-20 place-items-center rounded-2xl",
                      task.tone,
                    )}
                  >
                    <Icon className="size-10" />
                  </span>
                  <span className="grid gap-1">
                    {first ? (
                      <span className="text-lg font-semibold text-primary">
                        {m.homeYoungContinue()}
                      </span>
                    ) : null}
                    <span
                      dir="auto"
                      className="young-words text-2xl leading-8 font-bold"
                    >
                      {task.title}
                    </span>
                    <span
                      dir="auto"
                      className="text-base leading-6 text-muted-foreground"
                    >
                      {task.subtitle}
                    </span>
                  </span>
                </Link>
                <ReadAloud
                  text={task.title}
                  size="card"
                  className="absolute end-4 top-4"
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
