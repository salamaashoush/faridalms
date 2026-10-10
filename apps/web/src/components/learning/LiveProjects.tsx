import type { ProjectFile } from "@faridalms/domain/project";
import type { RefObject } from "react";

import { useEffect, useMemo, useRef, useState } from "react";

import { playedPage } from "~/components/coding/project-page";
import { WebPreview } from "~/components/coding/WebPreview";
import { WebProjectStudio } from "~/components/coding/WebProjectStudio";
import { RecordSection } from "~/components/system/RecordPage";
import { StatusBadge } from "~/components/system/status";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

/** How long a project may go unchanged before its student may be stuck. */
const IDLE_MINUTES = 5;

export interface LiveProject {
  lessonId: string;
  blockId: string;
  studentId: string;
  prompt: string;
  files: ProjectFile[];
  keptAt: string;
}

const minutesBetween = (from: string, to: string) =>
  Math.max(0, Math.floor((Date.parse(to) - Date.parse(from)) / 60_000));

/** Whether something has come into view yet; a page is played only once it has. */
function useSeen(holder: RefObject<HTMLElement | null>) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const element = holder.current;
    if (!element || seen) return undefined;
    const watcher = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setSeen(true);
      },
      { rootMargin: "200px" },
    );
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [holder, seen]);
  return seen;
}

function ProjectCard({
  project,
  name,
  now,
  here,
}: {
  project: LiveProject;
  name: string;
  now: string;
  /** The student is still in the lesson, so a long pause may mean they are stuck. */
  here: boolean;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const seen = useSeen(holder);
  // The class is asked about every few seconds; a page is played again
  // only when its files have changed.
  const written = JSON.stringify(project.files);
  const page = useMemo(
    () => playedPage(JSON.parse(written) as ProjectFile[]),
    [written],
  );
  const [errors, setErrors] = useState(0);
  const [open, setOpen] = useState(false);
  const idle = minutesBetween(project.keptAt, now);
  return (
    <li className="grid gap-2 rounded-lg border bg-card p-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-sm leading-5 font-medium">{name}</span>
        {errors > 0 ? (
          <StatusBadge tone="danger">{m.liveProjectError()}</StatusBadge>
        ) : here && idle >= IDLE_MINUTES ? (
          <StatusBadge tone="warning">
            {m.liveProjectIdle({ count: idle })}
          </StatusBadge>
        ) : null}
      </div>
      <div
        ref={holder}
        className="relative h-44 overflow-hidden rounded-md border bg-white"
      >
        {seen ? (
          // Drawn at twice the size and shown at half, so a whole page fits a card.
          <div className="absolute top-0 left-0 flex h-[200%] w-[200%] origin-top-left scale-50 flex-col">
            <WebPreview page={page} fill quiet onErrors={setErrors} />
          </div>
        ) : null}
        <button
          type="button"
          aria-label={m.liveProjectOpen({ name })}
          className="absolute inset-0 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => setOpen(true)}
        />
      </div>
      <p
        dir="auto"
        className="truncate text-[13px] leading-[18px] text-muted-foreground"
      >
        {project.prompt}
      </p>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {idle === 0 ? m.liveProjectNow() : m.liveProjectIdle({ count: idle })}
      </p>
      {open ? (
        <WebProjectStudio
          title={name}
          files={project.files}
          unkept
          onClose={() => setOpen(false)}
        />
      ) : null}
    </li>
  );
}

/**
 * The projects a class is building, each page as its student last left it:
 * who has an error on the page, who has changed nothing for a while, and
 * any one to open large, with its code, to show the room.
 */
export function LiveProjects({
  projects,
  names,
  here,
  now,
}: {
  projects: readonly LiveProject[];
  names: ReadonlyMap<string, string>;
  /** The students still in a lesson. */
  here: ReadonlySet<string>;
  now: string;
}) {
  if (projects.length === 0) return null;
  const ordered = projects.toSorted((a, b) =>
    (names.get(a.studentId) ?? "").localeCompare(names.get(b.studentId) ?? ""),
  );
  return (
    <RecordSection
      title={`${m.liveProjects()} ${formatNumber(projects.length)}`}
      description={m.liveProjectsHint()}
    >
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ordered.map((project) => (
          <ProjectCard
            key={`${project.studentId}:${project.lessonId}:${project.blockId}`}
            project={project}
            name={names.get(project.studentId) ?? ""}
            now={now}
            here={here.has(project.studentId)}
          />
        ))}
      </ul>
    </RecordSection>
  );
}
