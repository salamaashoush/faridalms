import { Dialog } from "@base-ui/react/dialog";
import {
  Camera,
  Mic,
  MicOff,
  Monitor,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  Square,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MediaPlayer } from "./media-view";
import { cx } from "./ui";

export interface VideoRecorderStrings {
  title: string;
  hint: string;
  camera: string;
  screen: string;
  both: string;
  microphone: string;
  start: string;
  pause: string;
  resume: string;
  stop: string;
  again: string;
  keep: string;
  close: string;
  /** The browser or the person refused the camera, the screen or the microphone. */
  refused: string;
  /** Said over the picture before recording begins. */
  startsIn: (seconds: number) => string;
  /** Read out with the time recorded so far and the most allowed. */
  elapsed: (recorded: string, most: string) => string;
  captions: string;
}

type Source = "camera" | "screen" | "both";
type Phase = "setup" | "counting" | "recording" | "paused" | "recorded";

/** Lesson videos hold attention for about six minutes; ten is as long as one may run. */
const MOST_SECONDS = 600;
const VIDEO_BITS = 2_500_000;
const FRAME_RATE = 30;
const COUNT_FROM = 3;

/** The first container this browser records video into, with the file name it takes. */
export function videoFormat(): { mimeType: string; extension: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const formats = [
    // MP4 knows its own length and plays everywhere before the streams are made.
    { mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", extension: "mp4" },
    { mimeType: "video/mp4", extension: "mp4" },
    { mimeType: "video/webm;codecs=vp9,opus", extension: "webm" },
    { mimeType: "video/webm;codecs=vp8,opus", extension: "webm" },
    { mimeType: "video/webm", extension: "webm" },
  ];
  return (
    formats.find((format) => MediaRecorder.isTypeSupported(format.mimeType)) ??
    null
  );
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

const button =
  "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 max-md:h-10 [&_svg]:size-4";

/** What a recording holds while it runs, all let go of when it ends. */
interface Session {
  tracks: MediaStreamTrack[];
  recorder: MediaRecorder | null;
  stopDrawing: (() => void) | null;
  audio: AudioContext | null;
  ticking: ReturnType<typeof setInterval> | undefined;
  counting: ReturnType<typeof setInterval> | undefined;
}

function release(session: Session) {
  clearInterval(session.ticking);
  clearInterval(session.counting);
  session.stopDrawing?.();
  for (const track of session.tracks) track.stop();
  void session.audio?.close();
  session.stopDrawing = null;
  session.audio = null;
  session.tracks = [];
}

async function playing(stream: MediaStream): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  await video.play();
  return video;
}

/**
 * The screen with the teacher's camera in a round corner over it, drawn
 * frame by frame. A timer in a worker drives the drawing: the page's own
 * timers slow to a crawl while the teacher works in another tab, and so
 * would the recording.
 */
async function composite(
  screen: MediaStream,
  camera: MediaStream,
  corner: "left" | "right",
): Promise<{ track: MediaStreamTrack; stop: () => void }> {
  const [screenVideo, cameraVideo] = await Promise.all([
    playing(screen),
    playing(camera),
  ]);
  const settings = screen.getVideoTracks()[0]?.getSettings();
  const wide = settings?.width ?? 1280;
  const high = settings?.height ?? 720;
  const scale = Math.min(1, 1920 / wide, 1080 / high);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(wide * scale);
  canvas.height = Math.round(high * scale);
  const context = canvas.getContext("2d");
  const size = Math.round(Math.min(canvas.width, canvas.height) * 0.24);
  const margin = Math.round(size * 0.12);
  const draw = () => {
    if (!context) return;
    context.drawImage(screenVideo, 0, 0, canvas.width, canvas.height);
    const x = corner === "left" ? margin : canvas.width - size - margin;
    const y = canvas.height - size - margin;
    const side = Math.min(cameraVideo.videoWidth, cameraVideo.videoHeight);
    if (side === 0) return;
    context.save();
    context.beginPath();
    context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    context.clip();
    context.drawImage(
      cameraVideo,
      (cameraVideo.videoWidth - side) / 2,
      (cameraVideo.videoHeight - side) / 2,
      side,
      side,
      x,
      y,
      size,
      size,
    );
    context.restore();
    context.lineWidth = Math.max(2, size / 40);
    context.strokeStyle = "rgba(255, 255, 255, 0.9)";
    context.beginPath();
    context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    context.stroke();
  };
  const source = URL.createObjectURL(
    new Blob(
      [`setInterval(() => postMessage(0), ${Math.round(1000 / FRAME_RATE)});`],
      { type: "text/javascript" },
    ),
  );
  const worker = new Worker(source);
  worker.addEventListener("message", draw);
  const [track] = canvas.captureStream(FRAME_RATE).getVideoTracks();
  if (!track) throw new Error("the browser cannot record a drawing");
  return {
    track,
    stop: () => {
      worker.terminate();
      URL.revokeObjectURL(source);
      screenVideo.srcObject = null;
      cameraVideo.srcObject = null;
    },
  };
}

/** One sound track from several: the microphone and what the screen plays. */
function mixed(
  tracks: MediaStreamTrack[],
  session: Session,
): MediaStreamTrack | null {
  if (tracks.length <= 1) return tracks[0] ?? null;
  const audio = new AudioContext();
  session.audio = audio;
  const out = audio.createMediaStreamDestination();
  for (const track of tracks)
    audio.createMediaStreamSource(new MediaStream([track])).connect(out);
  return out.stream.getAudioTracks()[0] ?? null;
}

/**
 * Records a lesson video in the browser: the teacher's camera, their screen,
 * or the screen with the camera in a corner, with their voice. Nothing
 * leaves the page until they keep the take.
 */
function Studio({
  strings,
  locale,
  maxSeconds,
  onKeep,
}: {
  strings: VideoRecorderStrings;
  locale: string;
  maxSeconds: number;
  onKeep: (file: File, seconds: number) => void;
}) {
  const format = videoFormat();
  // Phones and pages served without a secure origin cannot share a screen.
  const canShare =
    typeof navigator !== "undefined" &&
    "mediaDevices" in navigator &&
    typeof navigator.mediaDevices.getDisplayMedia === "function";
  const [source, setSource] = useState<Source>("camera");
  const [mic, setMic] = useState(true);
  const [phase, setPhase] = useState<Phase>("setup");
  const [count, setCount] = useState(COUNT_FROM);
  const [seconds, setSeconds] = useState(0);
  const [refused, setRefused] = useState(false);
  const [take, setTake] = useState<{
    file: File;
    url: string;
    seconds: number;
  } | null>(null);
  const live = useRef<HTMLVideoElement>(null);
  const session = useRef<Session>({
    tracks: [],
    recorder: null,
    stopDrawing: null,
    audio: null,
    ticking: undefined,
    counting: undefined,
  });

  // Closing the studio lets go of the camera, the screen and the microphone.
  useEffect(() => {
    const held = session.current;
    return () => {
      if (held.recorder?.state !== "inactive") held.recorder?.stop();
      release(held);
    };
  }, []);

  useEffect(
    () => () => {
      if (take) URL.revokeObjectURL(take.url);
    },
    [take],
  );

  const record = (stream: MediaStream) => {
    if (!format) return;
    const current = session.current;
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: format.mimeType,
      videoBitsPerSecond: VIDEO_BITS,
    });
    let recorded = 0;
    let since = Date.now();
    let running = true;
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    recorder.addEventListener("pause", () => {
      recorded += (Date.now() - since) / 1000;
      running = false;
    });
    recorder.addEventListener("resume", () => {
      since = Date.now();
      running = true;
    });
    recorder.addEventListener("stop", () => {
      const length = recorded + (running ? (Date.now() - since) / 1000 : 0);
      release(current);
      const type = format.mimeType.split(";")[0] ?? "video/webm";
      const file = new File(
        chunks,
        `recording-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.${format.extension}`,
        { type },
      );
      setTake({
        file,
        url: URL.createObjectURL(file),
        seconds: Math.min(length, maxSeconds),
      });
      setPhase("recorded");
    });
    current.recorder = recorder;
    recorder.start(1000);
    setSeconds(0);
    setPhase("recording");
    current.ticking = setInterval(() => {
      const passed =
        recorded +
        (recorder.state === "recording" ? (Date.now() - since) / 1000 : 0);
      setSeconds(passed);
      if (passed >= maxSeconds && recorder.state !== "inactive")
        recorder.stop();
    }, 250);
  };

  const begin = async () => {
    const current = session.current;
    setRefused(false);
    let shown: MediaStreamTrack | null = null;
    let sound: MediaStreamTrack[] = [];
    try {
      const camera =
        source === "screen"
          ? null
          : await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: "user",
              },
              audio: false,
            });
      if (camera) current.tracks.push(...camera.getTracks());
      const screen =
        source === "camera"
          ? null
          : await navigator.mediaDevices.getDisplayMedia({
              video: { frameRate: FRAME_RATE },
              audio: true,
            });
      if (screen) current.tracks.push(...screen.getTracks());
      const voice = mic
        ? await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          })
        : null;
      if (voice) current.tracks.push(...voice.getTracks());
      // A screen shared and then stopped from the browser's own bar ends the take.
      screen?.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (current.recorder && current.recorder.state !== "inactive")
          current.recorder.stop();
        else {
          release(current);
          setPhase("setup");
        }
      });
      if (screen && camera) {
        const drawn = await composite(
          screen,
          camera,
          locale.startsWith("ar") ? "left" : "right",
        );
        current.stopDrawing = drawn.stop;
        current.tracks.push(drawn.track);
        shown = drawn.track;
      } else shown = (screen ?? camera)?.getVideoTracks()[0] ?? null;
      sound = [
        ...(voice?.getAudioTracks() ?? []),
        ...(screen?.getAudioTracks() ?? []),
      ];
    } catch {
      release(current);
      setRefused(true);
      return;
    }
    if (!shown) return;
    const audio = mixed(sound, current);
    const stream = new MediaStream(audio ? [shown, audio] : [shown]);
    if (live.current) {
      live.current.srcObject = new MediaStream([shown]);
      void live.current.play();
    }
    setCount(COUNT_FROM);
    setPhase("counting");
    let left = COUNT_FROM;
    current.counting = setInterval(() => {
      left -= 1;
      setCount(left);
      if (left > 0) return;
      clearInterval(current.counting);
      record(stream);
    }, 1000);
  };

  const again = () => {
    setTake(null);
    setPhase("setup");
  };

  if (!format) return null;
  const sources: { value: Source; label: string; icon: typeof Camera }[] = [
    { value: "camera", label: strings.camera, icon: Camera },
    ...(canShare
      ? [
          { value: "screen" as const, label: strings.screen, icon: Monitor },
          {
            value: "both" as const,
            label: strings.both,
            icon: PictureInPicture2,
          },
        ]
      : []),
  ];
  const busy =
    phase === "counting" || phase === "recording" || phase === "paused";
  return (
    <div className="grid gap-4">
      {phase === "recorded" && take ? (
        <MediaPlayer
          src={take.url}
          captions={undefined}
          video
          locale={locale}
          captionsLabel={strings.captions}
        />
      ) : (
        <div className="relative isolate grid aspect-video w-full place-items-center overflow-hidden rounded-lg bg-black text-white">
          <video
            ref={live}
            muted
            playsInline
            aria-hidden
            className={cx(
              "absolute inset-0 size-full object-contain",
              !busy && "hidden",
            )}
          />
          {phase === "setup" ? (
            <p className="max-w-sm px-6 text-center text-sm leading-6 text-white/80">
              {strings.hint}
            </p>
          ) : null}
          {phase === "counting" ? (
            <p
              aria-live="assertive"
              className="z-10 grid size-24 place-items-center rounded-full bg-black/60 text-5xl font-semibold tabular-nums"
            >
              <span className="sr-only">{strings.startsIn(count)}</span>
              <span aria-hidden>{count}</span>
            </p>
          ) : null}
          {phase === "recording" || phase === "paused" ? (
            <p className="absolute start-3 top-3 z-10 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm font-medium tabular-nums">
              <span
                aria-hidden
                className={cx(
                  "size-2.5 rounded-full bg-red-500",
                  phase === "recording" && "motion-safe:animate-pulse",
                )}
              />
              <span
                role="timer"
                aria-label={strings.elapsed(clock(seconds), clock(maxSeconds))}
              >
                {clock(seconds)} / {clock(maxSeconds)}
              </span>
            </p>
          ) : null}
        </div>
      )}
      {refused ? (
        <p role="alert" className="text-sm leading-5 text-destructive">
          {strings.refused}
        </p>
      ) : null}
      {phase === "setup" ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <fieldset className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
            <legend className="sr-only">{strings.title}</legend>
            {sources.map((item) => (
              <label key={item.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="recording-source"
                  value={item.value}
                  checked={source === item.value}
                  onChange={() => setSource(item.value)}
                  className="peer sr-only"
                />
                <span className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-muted-foreground peer-checked:bg-background peer-checked:text-foreground peer-checked:shadow-sm peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 hover:text-foreground max-md:h-10 [&_svg]:size-4">
                  <item.icon aria-hidden />
                  {item.label}
                </span>
              </label>
            ))}
          </fieldset>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={mic}
              onClick={() => setMic(!mic)}
              className={cx(
                button,
                "border text-foreground hover:bg-accent aria-pressed:border-primary/40 aria-pressed:bg-primary/10",
              )}
            >
              {mic ? <Mic aria-hidden /> : <MicOff aria-hidden />}
              {strings.microphone}
            </button>
            <button
              type="button"
              onClick={() => void begin()}
              className={cx(
                button,
                "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              <span aria-hidden className="size-2.5 rounded-full bg-red-500" />
              {strings.start}
            </button>
          </div>
        </div>
      ) : null}
      {phase === "recording" || phase === "paused" ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              const recorder = session.current.recorder;
              if (!recorder) return;
              if (recorder.state === "recording") {
                recorder.pause();
                setPhase("paused");
              } else {
                recorder.resume();
                setPhase("recording");
              }
            }}
            className={cx(button, "border text-foreground hover:bg-accent")}
          >
            {phase === "paused" ? <Play aria-hidden /> : <Pause aria-hidden />}
            {phase === "paused" ? strings.resume : strings.pause}
          </button>
          <button
            type="button"
            onClick={() => session.current.recorder?.stop()}
            className={cx(
              button,
              "bg-destructive text-white hover:bg-destructive/90",
            )}
          >
            <Square aria-hidden className="fill-current" />
            {strings.stop}
          </button>
        </div>
      ) : null}
      {phase === "recorded" && take ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={again}
            className={cx(button, "border text-foreground hover:bg-accent")}
          >
            <RotateCcw aria-hidden />
            {strings.again}
          </button>
          <button
            type="button"
            onClick={() => onKeep(take.file, take.seconds)}
            className={cx(
              button,
              "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {strings.keep}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** The studio in a dialog of its own, opened from the editor's insert menu. */
export function VideoRecorder({
  open,
  onOpenChange,
  strings,
  locale,
  maxSeconds = MOST_SECONDS,
  onKeep,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  strings: VideoRecorderStrings;
  locale: string;
  maxSeconds?: number;
  /** Given the take and how many seconds it runs. */
  onKeep: (file: File, seconds: number) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/30 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup className="fixed inset-0 z-50 m-auto grid h-fit max-h-[calc(100dvh-2rem)] w-[min(52rem,calc(100vw-2rem))] gap-4 overflow-y-auto rounded-xl border bg-background p-4 text-foreground shadow-2xl outline-none sm:p-5">
          <div className="flex items-center gap-3">
            <Dialog.Title className="min-w-0 flex-1 truncate text-base font-semibold">
              {strings.title}
            </Dialog.Title>
            <Dialog.Close
              aria-label={strings.close}
              className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&_svg]:size-4"
            >
              <X aria-hidden />
            </Dialog.Close>
          </div>
          {open ? (
            <Studio
              strings={strings}
              locale={locale}
              maxSeconds={Math.min(maxSeconds, MOST_SECONDS)}
              onKeep={(file, seconds) => {
                onKeep(file, seconds);
                onOpenChange(false);
              }}
            />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
