import { Mic, RotateCcw, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MediaPlayer } from "./media-view";

export interface RecorderStrings {
  record: string;
  stop: string;
  again: string;
  discard: string;
  /** The browser or the person refused the microphone. */
  refused: string;
  /** Read out with the time recorded so far and the most allowed. */
  elapsed: (recorded: string, most: string) => string;
  captions: string;
}

/** The first container this browser records sound into, with the file name it takes. */
export function soundFormat(): { mimeType: string; extension: string } | null {
  if (typeof MediaRecorder === "undefined") return null;
  const formats = [
    // AAC in MP4 plays on every iPad; WebM plays there only from iPadOS 17.4.
    { mimeType: "audio/mp4;codecs=mp4a.40.2", extension: "m4a" },
    { mimeType: "audio/webm;codecs=opus", extension: "webm" },
    { mimeType: "audio/webm", extension: "webm" },
    // Safari records only into MP4.
    { mimeType: "audio/mp4", extension: "m4a" },
  ];
  return (
    formats.find((format) => MediaRecorder.isTypeSupported(format.mimeType)) ??
    null
  );
}

const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

const button =
  "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 max-md:h-10 [&_svg]:size-4";

/**
 * Records a voice note in the browser, up to `maxSeconds`, and hands the
 * file over once the person keeps it. Nothing leaves the page until then.
 */
export function VoiceRecorder({
  strings,
  locale,
  maxSeconds = 180,
  onKeep,
}: {
  strings: RecorderStrings & { keep: string };
  locale: string;
  maxSeconds?: number;
  /** Given the recording and how many seconds it runs. */
  onKeep: (file: File, seconds: number) => void;
}) {
  const [state, setState] = useState<"idle" | "recording" | "recorded">("idle");
  const [seconds, setSeconds] = useState(0);
  const [refused, setRefused] = useState(false);
  const [take, setTake] = useState<{
    file: File;
    url: string;
    seconds: number;
  } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const format = soundFormat();

  // Letting go of the page lets go of the microphone too.
  useEffect(() => {
    const held = recorder;
    const ticking = timer;
    return () => {
      clearInterval(ticking.current);
      held.current?.stream.getTracks().forEach((track) => track.stop());
      if (held.current?.state === "recording") held.current.stop();
    };
  }, []);

  useEffect(
    () => () => {
      if (take) URL.revokeObjectURL(take.url);
    },
    [take],
  );

  const start = async () => {
    if (!format) return;
    setRefused(false);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setRefused(true);
      return;
    }
    const chunks: Blob[] = [];
    const began = Date.now();
    const next = new MediaRecorder(stream, { mimeType: format.mimeType });
    next.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    next.addEventListener("stop", () => {
      clearInterval(timer.current);
      stream.getTracks().forEach((track) => track.stop());
      const type = format.mimeType.split(";")[0] ?? "audio/webm";
      const file = new File(
        chunks,
        `voice-${new Date().toISOString().slice(0, 19).replaceAll(":", "-")}.${format.extension}`,
        { type },
      );
      setTake({
        file,
        url: URL.createObjectURL(file),
        seconds: (Date.now() - began) / 1000,
      });
      setState("recorded");
    });
    recorder.current = next;
    next.start(1000);
    setSeconds(0);
    setState("recording");
    timer.current = setInterval(() => {
      const passed = (Date.now() - began) / 1000;
      setSeconds(passed);
      if (passed >= maxSeconds && next.state === "recording") next.stop();
    }, 250);
  };

  if (!format) return null;
  return (
    <div className="grid gap-2">
      {state === "recorded" && take ? (
        <>
          <MediaPlayer
            src={take.url}
            captions={undefined}
            video={false}
            locale={locale}
            captionsLabel={strings.captions}
          />
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              className={`${button} bg-primary text-primary-foreground hover:bg-primary/90`}
              onClick={() => {
                onKeep(take.file, take.seconds);
                setTake(null);
                setState("idle");
              }}
            >
              {strings.keep}
            </button>
            <button
              type="button"
              className={`${button} hover:bg-muted`}
              onClick={() => void start()}
            >
              <RotateCcw aria-hidden />
              {strings.again}
            </button>
            <button
              type="button"
              className={`${button} hover:bg-muted`}
              onClick={() => {
                setTake(null);
                setState("idle");
              }}
            >
              <Trash2 aria-hidden />
              {strings.discard}
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          {state === "recording" ? (
            <button
              type="button"
              className={`${button} bg-destructive text-white hover:bg-destructive/90`}
              onClick={() => recorder.current?.stop()}
            >
              <Square aria-hidden className="fill-current" />
              {strings.stop}
            </button>
          ) : (
            <button
              type="button"
              className={`${button} border hover:bg-muted`}
              onClick={() => void start()}
            >
              <Mic aria-hidden />
              {strings.record}
            </button>
          )}
          {state === "recording" ? (
            <span
              role="timer"
              aria-live="off"
              className="text-[13px] leading-[18px] text-muted-foreground tabular-nums"
            >
              <span
                aria-hidden
                className="me-1.5 inline-block size-2 animate-pulse rounded-full bg-destructive"
              />
              {strings.elapsed(clock(seconds), clock(maxSeconds))}
            </span>
          ) : null}
        </div>
      )}
      {refused ? (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {strings.refused}
        </p>
      ) : null}
    </div>
  );
}
