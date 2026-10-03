import type { ReactElement, ReactNode, Ref } from "react";

import "@videojs/react/i18n/locales/ar/register";
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
  VolumeSlider,
} from "@videojs/react";
import { Audio, AudioPlayer } from "@videojs/react/audio";
import { I18nProvider, useTranslator } from "@videojs/react/i18n";
import { speedText } from "@videojs/react/i18n/text/menu";
import { usePlayer, Video, VideoPlayer } from "@videojs/react/video";
import {
  Check,
  Captions,
  CaptionsOff,
  LoaderCircle,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { lazy, Suspense, useMemo } from "react";

import { cx } from "./ui";

/** hls.js is large, so it loads only for a video that has streams. */
const HlsJsVideo = lazy(() =>
  import("@videojs/react/media/hlsjs-video").then((module) => ({
    default: module.HlsJsVideo,
  })),
);

export interface PlayerCaptions {
  src: string;
  lang: string;
  label: string;
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
}: {
  src: string;
  captions: PlayerCaptions | null;
  locale: string;
  element?: Ref<HTMLAudioElement>;
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
          <StatusAnnouncer className={announcer} />
        </Container>
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
