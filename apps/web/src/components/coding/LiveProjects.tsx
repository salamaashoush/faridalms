import type { ProjectFile } from "@faridalms/domain/project";
import type { RefObject } from "react";

import { programFile } from "@faridalms/domain/project";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { StatusBadge } from "@faridalms/ui/system/status";
import { Puzzle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type {
  LiveProject,
  LiveProjectsProps,
  LiveStudio,
} from "~/components/learning/slots";

import { playedPage } from "~/components/code/project-page";
import { WebPreview } from "~/components/code/WebPreview";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import { CodingStudio } from "./CodingStudio";
import { ProjectStudio } from "./ProjectStudio";

/** How long a project may go unchanged before its student may be stuck. */
const IDLE_MINUTES = 5;

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

interface ProjectCardProps {
  project: LiveProject;
  name: string;
  now: string;
  /** The student is still in the lesson, so a long pause may mean they are stuck. */
  here: boolean;
}

function ProjectCard({ project, name, now, here }: ProjectCardProps) {
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
  const program = programFile(project.files);
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
        {program ? (
          // A program is read here, and run once opened: running a class's
          // programs at once would load Python, or the board's editor, for each.
          <pre
            dir="ltr"
            className="h-full overflow-hidden px-2.5 py-2 font-mono text-[11px] leading-4 text-neutral-800 [font-variant-ligatures:none]"
          >
            {program.code}
          </pre>
        ) : seen ? (
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
        <ProjectStudio
          title={name}
          files={project.files}
          unkept
          onClose={() => setOpen(false)}
        />
      ) : null}
    </li>
  );
}

interface StudioCardProps {
  studio: LiveStudio;
  name: string;
  now: string;
  here: boolean;
}

/**
 * A coding project on the teacher's view of the class: its stage as the
 * student last saved it, since a studio saves after a pause in the work
 * and not as each block moves. Opened, it is the project itself, to run
 * and read with the room; nothing changed there is kept.
 */
function StudioCard({ studio, name, now, here }: StudioCardProps) {
  const [open, setOpen] = useState(false);
  const idle = minutesBetween(studio.savedAt, now);
  return (
    <li className="grid gap-2 rounded-lg border bg-card p-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-sm leading-5 font-medium">{name}</span>
        {here && idle >= IDLE_MINUTES ? (
          <StatusBadge tone="warning">
            {m.liveProjectIdle({ count: idle })}
          </StatusBadge>
        ) : null}
      </div>
      <div className="relative grid h-44 place-items-center overflow-hidden rounded-md border bg-white">
        {studio.thumbnailFileId ? (
          <img
            src={`/files/${studio.thumbnailFileId}`}
            alt=""
            className="size-full object-contain"
          />
        ) : (
          <Puzzle aria-hidden className="size-8 text-muted-foreground" />
        )}
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
        {studio.prompt}
      </p>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {idle === 0 ? m.liveProjectNow() : m.liveProjectIdle({ count: idle })}
      </p>
      {open ? (
        <CodingStudio
          projectUrl={`/files/${studio.projectFileId}`}
          mode="editor"
          title={name}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </li>
  );
}

/**
 * The projects a class is building, each as its student last left it: who
 * has an error on the page, who has changed nothing for a while, and any
 * one to open large, with its code, to show the room.
 */
export function LiveProjects({
  projects,
  studios,
  names,
  here,
  now,
}: LiveProjectsProps) {
  if (projects.length + studios.length === 0) return null;
  const nameOf = (item: { studentId: string }) =>
    names.get(item.studentId) ?? "";
  const ordered = [
    ...projects.map((project) => ({ project, studio: null })),
    ...studios.map((studio) => ({ project: null, studio })),
  ].toSorted((a, b) =>
    nameOf(a.project ?? a.studio).localeCompare(nameOf(b.project ?? b.studio)),
  );
  return (
    <RecordSection
      title={`${m.liveProjects()} ${formatNumber(ordered.length)}`}
      description={m.liveProjectsHint()}
    >
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ordered.map(({ project, studio }) =>
          project ? (
            <ProjectCard
              key={`${project.studentId}:${project.lessonId}:${project.blockId}`}
              project={project}
              name={nameOf(project)}
              now={now}
              here={here.has(project.studentId)}
            />
          ) : (
            <StudioCard
              key={`${studio.studentId}:${studio.lessonId}:${studio.blockId}`}
              studio={studio}
              name={nameOf(studio)}
              now={now}
              here={here.has(studio.studentId)}
            />
          ),
        )}
      </ul>
    </RecordSection>
  );
}
