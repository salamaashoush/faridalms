import type { NodeKey } from "lexical";

import { NARRATION_MS, spokenWords } from "@faridalms/domain/content";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  createCommand,
  isHTMLElement,
} from "lexical";
import {
  Highlighter,
  LoaderCircle,
  Mic,
  Play,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useEditorEnvironment } from "../context";
import { MediaPlayer } from "../media-view";
import { $narrationOf } from "../nodes/narration";
import { VoiceRecorder } from "../recorder";

/** Opens the floating bar's narration panel for the block or part with this key. */
export const OPEN_NARRATION_COMMAND = createCommand<NodeKey>("OPEN_NARRATION");

/** The longest recording a teacher may give a block, as Seesaw caps a voice note. */
export const NARRATION_SECONDS = NARRATION_MS / 1000;

/**
 * Marks each narrated block and part in the editor, so the teacher sees
 * which ones children will hear without opening any of them.
 */
export function NarrationMarksPlugin() {
  const [editor] = useLexicalComposerContext();
  const { narration } = useEditorEnvironment();
  useEffect(() => {
    if (!narration) return undefined;
    // Narrated nodes, by key: found by a walk once, then kept up to date
    // from the nodes each update changed, which are the only ones whose
    // narration can have changed.
    const narrated = new Set<NodeKey>();
    let marked = new Set<HTMLElement>();
    const draw = () => {
      const now = new Set(
        [...narrated]
          .map((key) => editor.getElementByKey(key))
          .filter(isHTMLElement),
      );
      for (const element of marked)
        if (!now.has(element)) delete element.dataset.narrated;
      for (const element of now)
        if (!element.hasAttribute("data-narrated"))
          element.dataset.narrated = "";
      marked = now;
    };
    editor.getEditorState().read(() => {
      const pending = [...$getRoot().getChildren()];
      for (let node = pending.pop(); node; node = pending.pop()) {
        if ($narrationOf(node)) narrated.add(node.getKey());
        if ($isElementNode(node)) pending.push(...node.getChildren());
      }
    });
    draw();
    return editor.registerUpdateListener(
      ({ editorState, dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
        editorState.read(() => {
          for (const key of narrated)
            if (!$getNodeByKey(key)?.isAttached()) narrated.delete(key);
          for (const key of [...dirtyElements.keys(), ...dirtyLeaves]) {
            const node = $getNodeByKey(key);
            if (node?.isAttached() && $narrationOf(node)) narrated.add(key);
            else narrated.delete(key);
          }
        });
        draw();
      },
    );
  }, [editor, narration]);
  return null;
}

/** How long a sound file plays, or null when the browser cannot tell. */
function durationOf(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (seconds: number | null) => {
      URL.revokeObjectURL(url);
      resolve(seconds);
    };
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () =>
      done(Number.isFinite(audio.duration) ? audio.duration : null),
    );
    audio.addEventListener("error", () => done(null));
    audio.src = url;
  });
}

const button =
  "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 max-md:h-10 [&_svg]:size-4";

/** A block's words and when each starts in its recording, none if untimed. */
export interface TimedWords {
  text: string;
  times: number[];
}

const SLOWER = 0.75;

/** The word playing at `now`, by when each starts, or -1 before the first. */
const wordAt = (times: number[], now: number) =>
  times.findLastIndex((time) => time <= now);

/**
 * Times each word of a block against its recording, as lyrics are synced by
 * hand: the recording plays and the teacher taps as each word begins, so a
 * young child sees the word light while hearing it, in any language. A
 * press marks the moment rather than a click, which lands on release.
 */
function TapAlong({
  src,
  words,
  onWords,
}: {
  src: string;
  words: TimedWords;
  onWords: (times: number[]) => void;
}) {
  const { strings } = useEditorEnvironment();
  const list = spokenWords(words.text);
  const timed = words.times.length > 0;
  const fits = timed && words.times.length === list.length;
  const audio = useRef<HTMLAudioElement | null>(null);
  const frame = useRef(0);
  const taps = useRef<number[]>([]);
  const tapper = useRef<HTMLButtonElement>(null);
  const chips = useRef<HTMLOListElement>(null);
  const [mode, setMode] = useState<"idle" | "tapping" | "preview">("idle");
  const [slower, setSlower] = useState(false);
  const [tapped, setTapped] = useState(0);
  const [lit, setLit] = useState(-1);
  const [problem, setProblem] = useState<string | null>(null);

  const halt = () => {
    cancelAnimationFrame(frame.current);
    audio.current?.pause();
    audio.current = null;
  };
  useEffect(
    () => () => {
      cancelAnimationFrame(frame.current);
      audio.current?.pause();
    },
    [],
  );
  useEffect(() => {
    if (mode === "tapping") tapper.current?.focus();
  }, [mode]);
  const shown = mode === "tapping" ? tapped : lit;
  useEffect(() => {
    chips.current?.children[shown]?.scrollIntoView({ block: "nearest" });
  }, [shown]);

  /** Plays the recording from its start, saying when it ends. */
  const play = (onEnd: () => void) => {
    halt();
    const player = new Audio(src);
    // Loading resets the rate to the default, so both are set.
    player.defaultPlaybackRate = slower ? SLOWER : 1;
    player.playbackRate = player.defaultPlaybackRate;
    player.addEventListener("ended", onEnd, { once: true });
    audio.current = player;
    return player;
  };

  const start = () => {
    setProblem(null);
    taps.current = [];
    setTapped(0);
    const player = play(() => {
      halt();
      setMode("idle");
      setProblem(strings.narrationWordsEnded);
    });
    setMode("tapping");
    void player.play().catch(() => setMode("idle"));
  };

  const mark = () => {
    const player = audio.current;
    if (mode !== "tapping" || !player) return;
    const now = Math.min(NARRATION_MS, Math.round(player.currentTime * 1000));
    const times = [...taps.current, Math.max(now, taps.current.at(-1) ?? 0)];
    taps.current = times;
    setTapped(times.length);
    if (times.length < list.length) return;
    halt();
    setMode("idle");
    onWords(times);
  };

  const preview = () => {
    setProblem(null);
    const player = play(() => {
      halt();
      setLit(-1);
      setMode("idle");
    });
    const tick = () => {
      setLit(wordAt(words.times, player.currentTime * 1000));
      frame.current = requestAnimationFrame(tick);
    };
    setMode("preview");
    void player
      .play()
      .then(() => {
        frame.current = requestAnimationFrame(tick);
      })
      .catch(() => setMode("idle"));
  };

  const stop = () => {
    halt();
    setLit(-1);
    setMode("idle");
  };

  return (
    <div className="grid gap-2 border-t pt-3">
      <div className="grid gap-0.5">
        <p className="text-sm leading-5 font-medium">
          {strings.narrationWords}
        </p>
        <p className="text-xs leading-4 text-muted-foreground">
          {mode === "tapping"
            ? strings.narrationWordsTap
            : !timed
              ? strings.narrationWordsHint
              : fits
                ? strings.narrationWordsDone
                : strings.narrationWordsStale}
        </p>
      </div>
      {mode === "idle" ? null : (
        <ol
          ref={chips}
          dir="auto"
          aria-hidden
          className="flex max-h-28 flex-wrap gap-x-1 gap-y-0.5 overflow-y-auto rounded-md bg-muted/50 p-2 text-sm leading-6"
        >
          {list.map(({ word, at }, index) => (
            // Words repeat, so where each sits in the text tells them apart.
            <li
              key={at}
              className={
                index === shown
                  ? "rounded bg-primary px-0.5 text-primary-foreground"
                  : mode === "tapping" && index > tapped
                    ? "px-0.5 text-muted-foreground"
                    : "px-0.5"
              }
            >
              {word}
            </li>
          ))}
        </ol>
      )}
      {mode === "tapping" ? (
        <div className="grid gap-2">
          <button
            ref={tapper}
            type="button"
            className="h-16 w-full touch-manipulation rounded-lg bg-primary px-3 text-lg font-semibold text-primary-foreground outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50"
            onPointerDown={(event) => {
              event.preventDefault();
              mark();
            }}
            onKeyDown={(event) => {
              if (
                (event.key === " " || event.key === "Enter") &&
                !event.repeat
              ) {
                event.preventDefault();
                mark();
              }
            }}
          >
            <span dir="auto">{list[tapped]?.word}</span>
          </button>
          <p className="text-xs leading-4 text-muted-foreground tabular-nums">
            {strings.narrationWordsCount(tapped, list.length)}
          </p>
          <button
            type="button"
            className={`${button} -ms-2.5 w-fit`}
            onClick={stop}
          >
            <X aria-hidden />
            {strings.narrationWordsCancel}
          </button>
        </div>
      ) : mode === "preview" ? (
        <button
          type="button"
          className={`${button} -ms-2.5 w-fit`}
          onClick={stop}
        >
          <Square aria-hidden className="fill-current" />
          {strings.narrationWordsStop}
        </button>
      ) : (
        <>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={slower}
              onChange={(event) => setSlower(event.target.checked)}
            />
            {strings.narrationWordsSlower}
          </label>
          <div className="-ms-2.5 flex flex-wrap items-center gap-1">
            <button type="button" className={button} onClick={start}>
              <Highlighter aria-hidden />
              {timed
                ? strings.narrationWordsAgain
                : strings.narrationWordsStart}
            </button>
            {fits ? (
              <button type="button" className={button} onClick={preview}>
                <Play aria-hidden />
                {strings.narrationWordsPreview}
              </button>
            ) : null}
            {timed ? (
              <button
                type="button"
                className={`${button} text-destructive`}
                onClick={() => onWords([])}
              >
                <Trash2 aria-hidden />
                {strings.narrationWordsRemove}
              </button>
            ) : null}
          </div>
        </>
      )}
      {problem ? (
        <p role="alert" className="text-xs leading-4 text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Records, uploads, plays or removes the narration of one block or part.
 * The recording is stored first and only then put on the block, so a
 * failed upload leaves the block as it was.
 */
export function NarrationPanel({
  fileId,
  onChange,
  onClose,
  words,
  onWords,
}: {
  fileId: string | null;
  onChange: (fileId: string | null) => void;
  onClose: () => void;
  /** A passage's words, which may be timed against the recording. */
  words?: TimedWords | null;
  onWords?: (times: number[]) => void;
}) {
  const { strings, media, locale } = useEditorEnvironment();
  const [again, setAgain] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!media) return null;

  const save = async (file: File) => {
    setProblem(null);
    const seconds = await durationOf(file);
    if (seconds !== null && seconds > NARRATION_SECONDS + 1) {
      setProblem(strings.narrationTooLong);
      return;
    }
    setSaving(true);
    try {
      const uploaded = await media.upload(file, "media");
      onChange(uploaded.fileId);
      setAgain(false);
    } catch {
      setProblem(strings.uploadFailed);
    } finally {
      setSaving(false);
    }
  };

  const choose = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = media.accept.media
      .filter((type) => type.startsWith("audio/"))
      .join(",");
    // Attached while open: Safari on iOS opens no chooser for a detached input.
    input.hidden = true;
    input.addEventListener("change", () => {
      const [file] = input.files ?? [];
      input.remove();
      if (file) void save(file);
    });
    input.addEventListener("cancel", () => input.remove());
    document.body.append(input);
    input.click();
  };

  const upload = (
    <button type="button" className={button} onClick={choose}>
      <Upload aria-hidden />
      {strings.narrationUpload}
    </button>
  );

  return (
    <div className="grid gap-3">
      <div className="flex items-start gap-2">
        <div className="grid flex-1 gap-0.5">
          <p className="text-sm leading-5 font-medium">{strings.narration}</p>
          <p className="text-xs leading-4 text-muted-foreground">
            {strings.narrationHint}
          </p>
        </div>
        <button
          type="button"
          aria-label={strings.narrationClose}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-10"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      {saving ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
          {strings.narrationSaving}
        </p>
      ) : fileId && !again ? (
        <>
          <MediaPlayer
            src={media.url(fileId)}
            captions={undefined}
            video={false}
            locale={locale}
            captionsLabel={strings.captions}
          />
          <div className="-ms-2.5 flex flex-wrap items-center gap-1">
            <button
              type="button"
              className={button}
              onClick={() => setAgain(true)}
            >
              <Mic aria-hidden />
              {strings.narrationAgain}
            </button>
            {upload}
            <button
              type="button"
              className={`${button} text-destructive`}
              onClick={() => onChange(null)}
            >
              <Trash2 aria-hidden />
              {strings.narrationRemove}
            </button>
          </div>
          {words && onWords && spokenWords(words.text).length > 1 ? (
            <TapAlong src={media.url(fileId)} words={words} onWords={onWords} />
          ) : null}
        </>
      ) : (
        <div className="grid justify-items-start gap-2">
          <VoiceRecorder
            strings={strings.recorder}
            locale={locale}
            maxSeconds={NARRATION_SECONDS}
            onKeep={(file) => void save(file)}
          />
          <div className="-ms-2.5">{upload}</div>
        </div>
      )}
      {problem ? (
        <p role="alert" className="text-xs leading-4 text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
