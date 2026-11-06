import { StartMark } from "@faridalms/editor/player";
import { useQuery } from "@tanstack/react-query";
import { Flag, LoaderCircle, Puzzle } from "lucide-react";
import { useState } from "react";

import * as m from "~/i18n/messages";
import { playQuery } from "~/queries/play";

import { StudioFrame } from "./StudioFrame";
import { useStudioFrame } from "./useStudioFrame";

/** The studio's player is its stage under a bar with the flag and stop: 480 by 360 and 44 more. */
const PLAYER_RATIO = "480 / 404";

export interface ProjectPlayerProps {
  projectUrl: string;
  /** A picture of the stage to show until the project runs. */
  stage: string | null;
  label: string;
}

/**
 * A project to run in place, as a project page on the Scratch website runs
 * one: its stage first, and the player only once someone presses the flag,
 * so a page of projects loads no studio until one is wanted.
 */
export function ProjectPlayer({
  projectUrl,
  stage,
  label,
}: ProjectPlayerProps) {
  const configured = Boolean(useQuery(playQuery).data);
  const [playing, setPlaying] = useState(false);
  if (playing && configured)
    return <Playing projectUrl={projectUrl} label={label} />;
  return (
    <button
      type="button"
      disabled={!configured}
      onClick={() => setPlaying(true)}
      aria-label={m.codingRun({ name: label })}
      className="group relative grid aspect-[4/3] w-full max-w-md cursor-pointer place-items-center overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default"
    >
      {/* Scratch's stage is white, and its picture is transparent wherever nothing is drawn. */}
      {stage ? (
        <img
          src={stage}
          alt=""
          className="absolute inset-0 size-full bg-white object-contain"
        />
      ) : (
        <Puzzle className="size-10 text-muted-foreground" aria-hidden />
      )}
      {configured ? (
        <span className="absolute inset-0 grid place-items-center transition-colors group-hover:bg-foreground/5">
          <StartMark>
            <Flag className="fill-current" aria-hidden />
          </StartMark>
        </span>
      ) : null}
    </button>
  );
}

interface PlayingProps {
  projectUrl: string;
  label: string;
}

function Playing({ projectUrl, label }: PlayingProps) {
  const studio = useStudioFrame({
    projectUrl,
    mode: "player",
    // The flag was pressed on our page; the project should not wait for a second press on its own.
    onLoaded: () => studio.start(),
  });
  return (
    <div
      className="relative w-full max-w-md overflow-hidden rounded-lg border bg-muted"
      style={{ aspectRatio: PLAYER_RATIO }}
    >
      {studio.source ? (
        <StudioFrame
          frame={studio.frame}
          source={studio.source}
          title={label}
        />
      ) : null}
      {studio.loaded ? null : (
        <div className="absolute inset-0 grid place-items-center bg-muted">
          <LoaderCircle
            className="size-6 animate-spin text-muted-foreground"
            aria-label={m.studioLoading()}
          />
        </div>
      )}
    </div>
  );
}
