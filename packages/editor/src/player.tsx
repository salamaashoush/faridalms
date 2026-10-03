import type { Cue } from "@faridalms/domain/captions";
import type { CommonMedia, Media } from "@videojs/react";
import type { ReactElement, ReactNode, Ref } from "react";

import "@videojs/react/i18n/locales/ar/register";
import { withoutVowelMarks } from "@faridalms/domain/arabic";
import { parseVtt } from "@faridalms/domain/captions";
import { mapCuesToThumbnails } from "@videojs/core";
import {
  BufferingIndicator,
  CaptionsButton,
  Container,
  Controls,
  ErrorDialog,
  FullscreenButton,
  Gesture,
  Hotkey,
  isMediaPauseCapable,
  isMediaSeekCapable,
  Menu,
  MuteButton,
  PiPButton,
  PlayButton,
  PlaybackRateRadioGroup,
  Poster,
  SeekIndicator,
  Slider,
  StatusAnnouncer,
  Time,
  TimeSlider,
  Tooltip,
  useMedia,
  VolumeSlider,
} from "@videojs/react";
import {
  Audio,
  AudioPlayer,
  usePlayer as useAudioPlayer,
} from "@videojs/react/audio";
import { I18nProvider, useTranslator } from "@videojs/react/i18n";
import { speedText } from "@videojs/react/i18n/text/menu";
import { usePlayer, Video, VideoPlayer } from "@videojs/react/video";
import {
  Check,
  Captions,
  CaptionsOff,
  ChevronDown,
  LoaderCircle,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  ScrollText,
  Search,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import { mediaClock } from "./format";
import { cx } from "./ui";

/** hls.js is large, so it loads only for a video that has streams. */
const HlsJsVideo = lazy(() =>
  import("@videojs/react/media/hlsjs-video").then((module) => ({
    default: module.HlsJsVideo,
  })),
);

/** What a student played of a recording since the last report, in whole seconds. */
export interface WatchReport {
  ranges: [number, number][];
  durationSeconds: number;
  positionSeconds: number;
}

/** A recording whose watching counts: where to pick up, and where to report. */
/** A time a video stops at for a question, and whether it is answered. */
export interface VideoMark {
  at: number;
  done: boolean;
}

export interface VideoControl {
  play: () => void;
  playFrom: (seconds: number) => void;
}

export interface MediaWatch {
  startAt: number;
  report: (watch: WatchReport) => void;
  /** Questions the video stops for; it plays past one only once answered. */
  stops?: readonly VideoMark[] | undefined;
  /** The video stopped for the question at this second. */
  onQuestion?: ((at: number) => void) | undefined;
  /** Hands the page the video's play: on past an answered question, or again from earlier. */
  bind?: ((control: VideoControl) => void) | undefined;
}

/** How often a playing recording reports, so a closed tab loses little. */
const REPORT_MS = 15_000;
/** A jump in time bigger than playback could make is a seek, not watching. */
const MAX_STEP_SECONDS = 3;
/** A seek to a stop lands a frame or so past it; this much past still counts as there. */
const STOP_SLACK = 0.25;
/** Picking up this close to either end would only confuse. */
const RESUME_MARGIN_SECONDS = 5;

/**
 * Video.js narrows a media's abilities but not its events; anything that can
 * seek and pause sends the media element's own events for them.
 */
const watchable = (media: Media | null): media is CommonMedia =>
  isMediaSeekCapable(media) && isMediaPauseCapable(media);

/**
 * Collects the stretches a student actually plays, never what they skip,
 * and reports them with where they are; on load it picks up where they
 * stopped last time.
 */
function Watching({
  watch,
  seek,
}: {
  watch: MediaWatch;
  seek: (seconds: number) => void;
}) {
  const media = useMedia();
  const latest = useRef({ watch, seek });
  useEffect(() => {
    latest.current = { watch, seek };
  });

  useEffect(() => {
    if (!watchable(media)) return undefined;
    let stretches: [number, number][] = [];
    let from: number | null = null;
    let last = media.currentTime;
    let resumed = false;

    const close = () => {
      if (from !== null && last > from)
        stretches.push([Math.floor(from), Math.ceil(last)]);
      from = null;
    };
    const open = () =>
      (latest.current.watch.stops ?? []).filter((stop) => !stop.done);
    // The seek a stop makes lands on the stop itself, and is not a student's.
    let settling = false;
    const stopAt = (at: number) => {
      last = at;
      close();
      media.pause();
      settling = true;
      latest.current.seek(at);
      latest.current.watch.onQuestion?.(at);
    };
    // Playing or seeking may go back to watch again, but never on past a
    // question not yet answered; the video returns to it and waits.
    const held = (slack = STOP_SLACK) => {
      const first = open()[0];
      if (!first || media.currentTime <= first.at + slack) return false;
      stopAt(first.at);
      return true;
    };
    const flush = () => {
      const playing = from !== null;
      close();
      const total = Math.ceil(media.duration);
      if (Number.isFinite(total) && total > 0) {
        latest.current.watch.report({
          ranges: stretches
            .map(([start, end]): [number, number] => [
              Math.min(start, total),
              Math.min(end, total),
            ])
            .filter(([start, end]) => start < end),
          durationSeconds: total,
          positionSeconds: Math.min(Math.floor(media.currentTime), total),
        });
        stretches = [];
      }
      if (playing) from = media.currentTime;
    };
    const onTime = () => {
      const now = media.currentTime;
      if (media.paused || media.seeking) {
        last = now;
        return;
      }
      if (from === null) from = now;
      else if (now < last || now - last > MAX_STEP_SECONDS) {
        close();
        from = now;
      }
      if (held()) return;
      last = now;
    };
    const onSeeking = () => close();
    const onSeeked = () => {
      if (settling) {
        settling = false;
        last = media.currentTime;
        return;
      }
      if (held()) return;
      const first = open()[0];
      if (first && Math.abs(media.currentTime - first.at) <= STOP_SLACK) {
        stopAt(first.at);
        return;
      }
      last = media.currentTime;
      if (!media.paused) from = last;
    };
    const onPlay = () => {
      const first = open()[0];
      if (first && Math.abs(media.currentTime - first.at) < STOP_SLACK * 2) {
        stopAt(first.at);
        return;
      }
      last = media.currentTime;
      from = last;
    };
    const onStop = () => {
      last = media.currentTime;
      if (media.ended && held(0)) return;
      flush();
    };
    const resume = () => {
      if (resumed) return;
      resumed = true;
      const first = open()[0];
      const saved = latest.current.watch.startAt;
      // Picking up never goes past a question still waiting for an answer.
      const at = first && first.at < saved ? first.at : saved;
      if (
        at > RESUME_MARGIN_SECONDS &&
        at < media.duration - RESUME_MARGIN_SECONDS
      ) {
        latest.current.seek(at);
        last = at;
        if (at === first?.at) latest.current.watch.onQuestion?.(at);
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };

    latest.current.watch.bind?.({
      play: () => void media.play(),
      playFrom: (seconds) => {
        latest.current.seek(seconds);
        void media.play();
      },
    });
    if (Number.isFinite(media.duration) && media.duration > 0) resume();
    media.addEventListener("loadedmetadata", resume);
    media.addEventListener("timeupdate", onTime);
    media.addEventListener("seeking", onSeeking);
    media.addEventListener("seeked", onSeeked);
    media.addEventListener("play", onPlay);
    media.addEventListener("pause", onStop);
    media.addEventListener("ended", onStop);
    document.addEventListener("visibilitychange", onHide);
    const timer = window.setInterval(() => {
      if (from !== null) flush();
    }, REPORT_MS);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      media.removeEventListener("loadedmetadata", resume);
      media.removeEventListener("timeupdate", onTime);
      media.removeEventListener("seeking", onSeeking);
      media.removeEventListener("seeked", onSeeked);
      media.removeEventListener("play", onPlay);
      media.removeEventListener("pause", onStop);
      media.removeEventListener("ended", onStop);
      if (from !== null || stretches.length > 0) flush();
    };
  }, [media]);
  return null;
}

/** Where a video stops for questions, on its timeline; answered ones in the accent. */
function Marks({ marks }: { marks: readonly VideoMark[] }) {
  const duration = usePlayer((state) => state.duration);
  if (!duration) return null;
  return marks.map((mark) => (
    <span
      key={mark.at}
      aria-hidden
      className={cx(
        "pointer-events-none absolute top-1/2 z-10 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-black/50",
        mark.done ? "bg-primary" : "bg-foreground",
      )}
      style={{ left: `${Math.min(100, (mark.at / duration) * 100)}%` }}
    />
  ));
}

function VideoWatching({ watch }: { watch: MediaWatch }) {
  const player = usePlayer();
  return <Watching watch={watch} seek={(seconds) => player.seek(seconds)} />;
}

function AudioWatching({ watch }: { watch: MediaWatch }) {
  const player = useAudioPlayer();
  return <Watching watch={watch} seek={(seconds) => player.seek(seconds)} />;
}

export interface PlayerCaptions {
  src: string;
  lang: string;
  label: string;
}

export interface TranscriptStrings {
  transcript: string;
  transcriptSearch: string;
  transcriptNoMatch: string;
}

/** Leave the transcript where a student scrolled it for this long before following again. */
const HOLD_SCROLL_MS = 4000;

const searchable = (text: string) =>
  withoutVowelMarks(text).toLocaleLowerCase();

/**
 * What a recording says, from its captions, as an interactive transcript
 * (Coursera, TED): the line being spoken is marked and kept in view, a line
 * plays from its start, and a search narrows the lines.
 */
function Transcript({
  captions,
  strings,
  time,
  seek,
}: {
  captions: PlayerCaptions;
  strings: TranscriptStrings;
  time: number;
  seek: (seconds: number) => void;
}) {
  const [cues, setCues] = useState<Cue[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const list = useRef<HTMLOListElement>(null);
  const held = useRef(0);
  const panel = useId();

  useEffect(() => {
    let gone = false;
    void fetch(captions.src)
      .then((response) => (response.ok ? response.text() : ""))
      .then((text) => {
        if (!gone) setCues(parseVtt(text));
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [captions.src]);

  const active = cues.findLastIndex((cue) => cue.start <= time);
  const wanted = searchable(query.trim());
  const shown = cues
    .map((cue, index) => ({ cue, index }))
    .filter(({ cue }) => !wanted || searchable(cue.text).includes(wanted));

  useEffect(() => {
    const box = list.current;
    if (!open || !box || wanted || Date.now() - held.current < HOLD_SCROLL_MS)
      return;
    const row = box.querySelector<HTMLElement>(`[data-cue="${active}"]`);
    if (row) box.scrollTop = row.offsetTop - box.clientHeight / 3;
  }, [active, open, wanted]);

  if (cues.length === 0) return null;
  const hold = () => {
    held.current = Date.now();
  };
  return (
    <div className="grid gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panel}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 items-center gap-1.5 justify-self-start rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 max-md:h-10 [&_svg]:size-4"
      >
        <ScrollText aria-hidden />
        {strings.transcript}
        <ChevronDown
          aria-hidden
          className={cx("transition-transform", open && "rotate-180")}
        />
      </button>
      {open ? (
        <div
          id={panel}
          className="overflow-hidden rounded-lg border bg-card text-card-foreground"
        >
          <label className="flex h-10 items-center gap-2 border-b px-3 text-muted-foreground focus-within:text-foreground">
            <Search aria-hidden className="size-4 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={strings.transcriptSearch}
              aria-label={strings.transcriptSearch}
              className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
          {shown.length === 0 ? (
            <p className="px-3 py-4 text-[13px] leading-[18px] text-muted-foreground">
              {strings.transcriptNoMatch}
            </p>
          ) : (
            <ol
              ref={list}
              lang={captions.lang}
              dir="auto"
              onWheel={hold}
              onTouchMove={hold}
              className="relative max-h-64 overflow-y-auto p-1"
            >
              {shown.map(({ cue, index }) => (
                <li key={index}>
                  <button
                    type="button"
                    data-cue={index}
                    aria-current={index === active || undefined}
                    onClick={() => seek(cue.start)}
                    className="flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-start text-sm leading-5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-current:bg-primary/5 aria-current:font-medium"
                  >
                    <span
                      dir="ltr"
                      className="w-10 shrink-0 text-[13px] text-muted-foreground tabular-nums"
                    >
                      {mediaClock(cue.start)}
                    </span>
                    <span dir="auto">{cue.text}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </div>
  );
}

function VideoTranscript(
  props: Omit<Parameters<typeof Transcript>[0], "time" | "seek">,
) {
  const time = usePlayer((state) => state.currentTime);
  const player = usePlayer();
  return (
    <Transcript
      {...props}
      time={time}
      seek={(seconds) => player.seek(seconds)}
    />
  );
}

function AudioTranscript(
  props: Omit<Parameters<typeof Transcript>[0], "time" | "seek">,
) {
  const time = useAudioPlayer((state) => state.currentTime);
  const player = useAudioPlayer();
  return (
    <Transcript
      {...props}
      time={time}
      seek={(seconds) => player.seek(seconds)}
    />
  );
}

/**
 * Playback controls and the timeline keep their left-to-right order in
 * Arabic, as Material and Apple's guidance has them: time runs the same way
 * in every script. Menus and labels still follow the page.
 */
const pageDirection = (locale: string) =>
  locale.startsWith("ar") ? "rtl" : "ltr";

const control =
  "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-foreground outline-none transition-colors hover:bg-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50 data-disabled:pointer-events-none data-disabled:opacity-50 max-md:size-10 [&_svg]:size-5";

const tooltip =
  "pointer-events-none flex items-center gap-1.5 rounded-md bg-foreground px-2 py-1 text-xs font-medium whitespace-nowrap text-background shadow-md transition-opacity duration-150 [--media-tooltip-side-offset:8px] data-ending-style:opacity-0 data-starting-style:opacity-0";

const menuPopup =
  "min-w-32 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg outline-none transition-opacity duration-150 [--media-popover-side-offset:8px] data-ending-style:opacity-0 data-starting-style:opacity-0";

const menuItem =
  "flex h-8 w-full cursor-default items-center gap-2 rounded-md px-2 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground max-md:h-10";

function PlayerTip({
  children,
  label,
}: {
  children: ReactElement;
  label?: string;
}) {
  return (
    <Tooltip.Root side="top">
      <Tooltip.Trigger render={children} />
      <Tooltip.Popup className={tooltip}>
        <Tooltip.Label>{label}</Tooltip.Label>
        <Tooltip.Shortcut className="font-sans text-background/60" />
      </Tooltip.Popup>
    </Tooltip.Root>
  );
}

function PlayControl() {
  return (
    <PlayerTip>
      <PlayButton
        className={control}
        render={(props, state) => (
          <button type="button" {...props}>
            {state.ended ? (
              <RotateCcw aria-hidden />
            ) : state.paused ? (
              <Play aria-hidden className="fill-current" />
            ) : (
              <Pause aria-hidden className="fill-current" />
            )}
          </button>
        )}
      />
    </PlayerTip>
  );
}

// Sliders use physical left: Video.js measures values from the left edge in
// every direction, and the controls sit in a left-to-right row.
const sliderRoot =
  "group/slider relative flex cursor-pointer touch-none items-center outline-none select-none";
const sliderTrack =
  "relative h-1 w-full overflow-hidden rounded-full bg-foreground/25 transition-[height] duration-150 group-data-interactive/slider:h-1.5";
const sliderThumb =
  "absolute top-1/2 left-(--media-slider-fill) size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary opacity-0 shadow-sm outline-none transition-opacity duration-150 group-data-dragging/slider:left-(--media-slider-pointer) group-data-interactive/slider:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50";
const sliderFill =
  "absolute inset-y-0 left-0 w-(--media-slider-fill) bg-primary group-data-dragging/slider:w-(--media-slider-pointer)";

function VolumeControl() {
  return (
    <div className="group/volume flex items-center">
      <PlayerTip>
        <MuteButton
          className={control}
          render={(props, state) => (
            <button type="button" {...props}>
              {state.muted || state.volumeLevel === "off" ? (
                <VolumeX aria-hidden />
              ) : state.volumeLevel === "high" ? (
                <Volume2 aria-hidden />
              ) : (
                <Volume1 aria-hidden />
              )}
            </button>
          )}
        />
      </PlayerTip>
      {/* A touch screen's volume is the device's own, so phones get the mute button only. */}
      <VolumeSlider.Root
        orientation="horizontal"
        className={cx(
          sliderRoot,
          "h-8 w-0 overflow-hidden opacity-0 transition-[width,opacity] duration-150 group-hover/volume:me-1 group-hover/volume:w-16 group-hover/volume:opacity-100 focus-within:me-1 focus-within:w-16 focus-within:overflow-visible focus-within:opacity-100 pointer-coarse:hidden",
        )}
      >
        <VolumeSlider.Track className={sliderTrack}>
          <VolumeSlider.Fill className={sliderFill} />
        </VolumeSlider.Track>
        <VolumeSlider.Thumb className={cx(sliderThumb, "opacity-100")} />
      </VolumeSlider.Root>
    </div>
  );
}

function Clock({ className }: { className?: string }) {
  return (
    <Time.Group
      className={cx(
        "inline-flex items-center px-1 text-[13px] leading-[18px] font-medium whitespace-nowrap tabular-nums",
        className,
      )}
    >
      <Time.Value type="current" />
      <Time.Separator className="mx-1 opacity-60" />
      <Time.Value type="duration" className="opacity-70" />
    </Time.Group>
  );
}

function SpeedMenu({ dir }: { dir: "ltr" | "rtl" }) {
  const t = useTranslator();
  return (
    <Menu.Root side="top" align="end">
      <PlaybackRateRadioGroup.Root>
        <PlayerTip label={t(speedText)}>
          <Menu.Trigger
            aria-label={t(speedText)}
            className={cx(
              control,
              "w-auto min-w-8 px-1.5 text-[13px] font-semibold tabular-nums max-md:min-w-10",
            )}
          >
            <PlaybackRateRadioGroup.Value />
          </Menu.Trigger>
        </PlayerTip>
        <Menu.Popup className={menuPopup} dir={dir}>
          <Menu.Content>
            <Menu.GroupLabel className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
              {t(speedText)}
            </Menu.GroupLabel>
            <PlaybackRateRadioGroup.Options
              renderItem={(props, item) => (
                <Menu.RadioItem {...props} className={menuItem}>
                  <span className="tabular-nums" dir="ltr">
                    {item.label}
                  </span>
                  <Menu.ItemIndicator
                    checked={item.checked}
                    className="ms-auto text-primary"
                  >
                    <Check aria-hidden className="size-4" />
                  </Menu.ItemIndicator>
                </Menu.RadioItem>
              )}
            />
          </Menu.Content>
        </Menu.Popup>
      </PlaybackRateRadioGroup.Root>
    </Menu.Root>
  );
}

function PlaybackKeys({ video }: { video: boolean }) {
  return (
    <>
      <Hotkey keys="Space" action="togglePaused" />
      <Hotkey keys="k" action="togglePaused" />
      <Hotkey keys="m" action="toggleMuted" />
      <Hotkey keys="ArrowRight" action="seekStep" value={5} />
      <Hotkey keys="ArrowLeft" action="seekStep" value={-5} />
      <Hotkey keys="l" action="seekStep" value={10} />
      <Hotkey keys="j" action="seekStep" value={-10} />
      <Hotkey keys="ArrowUp" action="volumeStep" />
      <Hotkey keys="ArrowDown" action="volumeStep" />
      <Hotkey keys="0-9" action="seekToPercent" />
      <Hotkey keys="Home" action="seekToPercent" value={0} />
      <Hotkey keys="End" action="seekToPercent" value={100} />
      <Hotkey keys=">" action="speedUp" />
      <Hotkey keys="<" action="speedDown" />
      {video ? (
        <>
          <Hotkey keys="f" action="toggleFullscreen" />
          <Hotkey keys="c" action="toggleSubtitles" />
          <Hotkey keys="i" action="togglePictureInPicture" />
        </>
      ) : null}
    </>
  );
}

const announcer = "sr-only";

/**
 * The frame under the pointer on the timeline. Its sheets are named
 * relative to the thumbnail track, and Video.js 10.0 reads that track's
 * address only from a plain video element, never through an adapter such
 * as hls.js, so it is resolved here from the address the player was given.
 */
function Preview({ track }: { track: string | null }) {
  const cues = usePlayer((state) => state.thumbnailsTrack?.cues);
  const thumbnails = useMemo(
    () => (track && cues ? mapCuesToThumbnails(cues, track) : undefined),
    [cues, track],
  );
  return (
    <Slider.Thumbnail.Root
      {...(thumbnails ? { thumbnails } : {})}
      className="max-h-[90px] max-w-40 overflow-hidden rounded-md bg-background shadow-md ring-1 ring-foreground/15 data-hidden:hidden"
    >
      <Slider.Thumbnail.Image />
    </Slider.Thumbnail.Root>
  );
}

/**
 * A video in the design system's own controls. The player is a dark surface
 * in either theme, as video players are, so it carries the dark tokens and
 * its chrome reads on any picture.
 */
export function VideoSurface({
  src,
  stream,
  poster,
  thumbnails,
  captions,
  locale,
  element,
  watch,
  strings,
}: {
  /** The upload as it is, played when there are no streams. */
  src: string | null;
  /** The adaptive streams' playlist, once the media service has made them. */
  stream: string | null;
  poster: string | null;
  thumbnails: string | null;
  captions: PlayerCaptions | null;
  locale: string;
  element?: Ref<HTMLVideoElement>;
  watch?: MediaWatch | undefined;
  strings?: TranscriptStrings | undefined;
}) {
  const dir = pageDirection(locale);
  const tracks = (
    <>
      {captions ? (
        <track
          kind="captions"
          src={captions.src}
          srcLang={captions.lang}
          label={captions.label}
          default
        />
      ) : null}
      {thumbnails ? (
        <track kind="metadata" label="thumbnails" src={thumbnails} default />
      ) : null}
    </>
  );
  const media = stream ? (
    <Suspense fallback={null}>
      <HlsJsVideo
        ref={element}
        source={{ src: stream, capRenditionToPlayerSize: true }}
        crossOrigin="anonymous"
        playsInline
        className="size-full object-contain"
      >
        {tracks}
      </HlsJsVideo>
    </Suspense>
  ) : src ? (
    <Video
      ref={element}
      src={src}
      preload="metadata"
      crossOrigin="anonymous"
      playsInline
      className="size-full object-contain"
    >
      {tracks}
    </Video>
  ) : null;

  return (
    <I18nProvider locale={locale}>
      <VideoPlayer {...(poster ? { poster } : {})}>
        <Container className="dark group/player relative isolate aspect-video w-full overflow-hidden rounded-lg bg-black text-foreground scheme-dark outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&_video::-webkit-media-text-track-container]:-translate-y-2 [&_video::-webkit-media-text-track-container]:transition-transform [&_video::-webkit-media-text-track-container]:duration-200 data-controls-visible:[&_video::-webkit-media-text-track-container]:-translate-y-16 [&_video::cue]:bg-black/75 [&_video::cue]:font-sans">
          {media}
          <Poster.Root className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 data-visible:opacity-100">
            <Poster.Image alt="" className="size-full object-contain" />
          </Poster.Root>
          <PlayButton
            className="group absolute inset-0 m-auto size-fit cursor-pointer rounded-full outline-none data-started:hidden"
            render={(props) => (
              // The bar's own play button is the one keyboards and screen readers use.
              <button type="button" {...props} tabIndex={-1} aria-hidden>
                <StartMark>
                  <Play aria-hidden className="translate-x-px fill-current" />
                </StartMark>
              </button>
            )}
          />
          <BufferingIndicator className="pointer-events-none absolute inset-0 m-auto hidden size-10 place-items-center rounded-full bg-background/70 data-visible:grid">
            <LoaderCircle aria-hidden className="size-6 animate-spin" />
          </BufferingIndicator>
          <SeekIndicator.Root className="pointer-events-none absolute top-1/2 grid size-16 -translate-y-1/2 place-items-center rounded-full bg-background/70 text-sm font-semibold tabular-nums transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 data-[direction=backward]:left-[12%] data-[direction=forward]:right-[12%]">
            <SeekIndicator.Value />
          </SeekIndicator.Root>
          <Controls.Root>
            <Controls.Backdrop className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-linear-to-t from-black/70 to-transparent transition-opacity duration-200 not-data-visible:opacity-0" />
            <Controls.Content
              dir="ltr"
              className="pointer-events-none absolute inset-x-0 bottom-0 grid gap-1 px-2 pb-1.5 transition-opacity duration-200 not-data-visible:not-has-focus-visible:opacity-0 max-md:pb-1"
            >
              <TimeSlider.Root
                className={cx(sliderRoot, "pointer-events-auto h-4 max-md:h-6")}
              >
                <TimeSlider.Track className={sliderTrack}>
                  <TimeSlider.Buffer className="absolute inset-y-0 left-0 w-(--media-slider-buffer) bg-foreground/25" />
                  <TimeSlider.Fill className={sliderFill} />
                </TimeSlider.Track>
                {watch?.stops?.length ? <Marks marks={watch.stops} /> : null}
                <TimeSlider.Thumb className={sliderThumb} />
                <TimeSlider.Preview className="bottom-full mb-2 flex flex-col items-center gap-1 opacity-0 transition-opacity duration-150 group-data-pointing/slider:opacity-100">
                  <Preview track={thumbnails} />
                  <TimeSlider.Value
                    type="pointer"
                    className="rounded-md bg-background/90 px-1.5 py-0.5 text-xs font-medium tabular-nums"
                  />
                </TimeSlider.Preview>
              </TimeSlider.Root>
              <Tooltip.Provider>
                <Controls.Group className="pointer-events-auto flex items-center gap-0.5">
                  <PlayControl />
                  <VolumeControl />
                  <Clock />
                  <span className="flex-1" />
                  <PlayerTip>
                    <CaptionsButton
                      className={control}
                      render={(props, state) => (
                        <button type="button" {...props}>
                          {state.subtitlesShowing ? (
                            <Captions aria-hidden />
                          ) : (
                            <CaptionsOff aria-hidden />
                          )}
                        </button>
                      )}
                    />
                  </PlayerTip>
                  <SpeedMenu dir={dir} />
                  <PlayerTip>
                    <PiPButton
                      className={cx(control, "max-sm:hidden")}
                      render={(props) => (
                        <button type="button" {...props}>
                          <PictureInPicture2 aria-hidden />
                        </button>
                      )}
                    />
                  </PlayerTip>
                  <PlayerTip>
                    <FullscreenButton
                      className={control}
                      render={(props, state) => (
                        <button type="button" {...props}>
                          {state.fullscreen ? (
                            <Minimize aria-hidden />
                          ) : (
                            <Maximize aria-hidden />
                          )}
                        </button>
                      )}
                    />
                  </PlayerTip>
                </Controls.Group>
              </Tooltip.Provider>
            </Controls.Content>
          </Controls.Root>
          <PlayerError />
          <PlaybackKeys video />
          {watch ? <VideoWatching watch={watch} /> : null}
          <Gesture
            type="tap"
            action="togglePaused"
            pointer="mouse"
            region="center"
          />
          <Gesture type="tap" action="toggleControls" pointer="touch" />
          <Gesture
            type="doubletap"
            action="seekStep"
            region="left"
            value={-10}
          />
          <Gesture type="doubletap" action="toggleFullscreen" region="center" />
          <Gesture
            type="doubletap"
            action="seekStep"
            region="right"
            value={10}
          />
          <StatusAnnouncer className={announcer} />
        </Container>
        {captions && strings ? (
          <VideoTranscript captions={captions} strings={strings} />
        ) : null}
      </VideoPlayer>
    </I18nProvider>
  );
}

function PlayerError() {
  return (
    <ErrorDialog.Root>
      <ErrorDialog.Backdrop className="absolute inset-0 bg-black/60" />
      <ErrorDialog.Popup className="absolute inset-0 m-auto grid h-fit w-[min(20rem,calc(100%-2rem))] gap-1.5 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg">
        <ErrorDialog.Title className="text-sm leading-5 font-semibold" />
        <ErrorDialog.Description className="text-[13px] leading-[18px] text-muted-foreground" />
        <ErrorDialog.Close className="mt-2 inline-flex h-8 cursor-pointer items-center justify-self-end rounded-md border bg-background px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50" />
      </ErrorDialog.Popup>
    </ErrorDialog.Root>
  );
}

/**
 * A recording as one quiet row in the page's own theme: play, the
 * timeline, the time and the speed, which helps a child following spoken
 * feedback or a reading in a second language.
 */
export function AudioBar({
  src,
  captions,
  locale,
  element,
  watch,
  strings,
}: {
  src: string;
  captions: PlayerCaptions | null;
  locale: string;
  element?: Ref<HTMLAudioElement>;
  watch?: MediaWatch | undefined;
  strings?: TranscriptStrings | undefined;
}) {
  const dir = pageDirection(locale);
  return (
    <I18nProvider locale={locale}>
      <AudioPlayer>
        <Container
          dir="ltr"
          className="flex h-12 w-full min-w-0 items-center gap-1 rounded-lg border bg-card px-1.5 text-card-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-md:h-14"
        >
          <Audio
            ref={element}
            src={src}
            preload="metadata"
            crossOrigin="anonymous"
          >
            {captions ? (
              <track
                kind="captions"
                src={captions.src}
                srcLang={captions.lang}
                label={captions.label}
                default
              />
            ) : null}
          </Audio>
          <Tooltip.Provider>
            <PlayControl />
            <Time.Value
              type="current"
              className="w-10 shrink-0 text-center text-[13px] font-medium tabular-nums"
            />
            <TimeSlider.Root
              className={cx(sliderRoot, "h-8 min-w-12 flex-1 px-1")}
            >
              <TimeSlider.Track className={sliderTrack}>
                <TimeSlider.Buffer className="absolute inset-y-0 left-0 w-(--media-slider-buffer) bg-foreground/15" />
                <TimeSlider.Fill className={sliderFill} />
              </TimeSlider.Track>
              <TimeSlider.Thumb className={sliderThumb} />
              <TimeSlider.Preview className="bottom-full mb-1 opacity-0 transition-opacity duration-150 group-data-pointing/slider:opacity-100">
                <TimeSlider.Value
                  type="pointer"
                  className="rounded-md bg-foreground px-1.5 py-0.5 text-xs font-medium text-background tabular-nums"
                />
              </TimeSlider.Preview>
            </TimeSlider.Root>
            <Time.Value
              type="duration"
              className="w-10 shrink-0 text-center text-[13px] text-muted-foreground tabular-nums"
            />
            <SpeedMenu dir={dir} />
            <VolumeControl />
          </Tooltip.Provider>
          <PlaybackKeys video={false} />
          {watch ? <AudioWatching watch={watch} /> : null}
          <StatusAnnouncer className={announcer} />
        </Container>
        {captions && strings ? (
          <AudioTranscript captions={captions} strings={strings} />
        ) : null}
      </AudioPlayer>
    </I18nProvider>
  );
}

/** The player's surface while it learns what it will play. */
export function PlayerFrame() {
  return (
    <div className="dark aspect-video w-full rounded-lg bg-black scheme-dark" />
  );
}

/**
 * The round mark that starts a picture: a video before it first plays, an
 * embed before it loads, a coding project before it runs. It is quiet
 * rather than the accent, as several can share a page.
 */
export function StartMark({ children }: { children: ReactNode }) {
  return (
    <span className="grid size-14 place-items-center rounded-full bg-foreground text-background shadow-md transition-transform duration-150 group-hover:scale-105 [&_svg]:size-6">
      {children}
    </span>
  );
}
