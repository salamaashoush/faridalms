import type { Cue } from "@faridalms/domain/captions";
import type { RefObject } from "react";

import { Dialog } from "@base-ui/react/dialog";
import { Tabs } from "@base-ui/react/tabs";
import {
  formatCueTime,
  parseCueTime,
  parseVtt,
  vttOf,
} from "@faridalms/domain/captions";
import {
  MAX_CHAPTER_TEXT,
  MAX_DESCRIPTION_TEXT,
  parseChapters,
  parseDescriptions,
} from "@faridalms/domain/chapters";
import { SPEECH_LANGUAGES } from "@faridalms/domain/file";
import {
  AudioLines,
  LoaderCircle,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { CaptionDraftStatus } from "./context";
import type { FramedSource, PlayerClock } from "./player";

import { useEditorEnvironment } from "./context";
import { mediaClock } from "./format";
import { MediaPlayer } from "./media-view";
import { FramedVideo } from "./player";

/** The parts of a recording a teacher writes beside it. */
export type RecordingTab =
  | "captions"
  | "chapters"
  | "descriptions"
  | "transcript";

/** How often a draft under way is asked after. */
const DRAFT_POLL_MS = 3000;

/** Languages captions are most often written in; any school may add its own. */
const LANGUAGES = [
  "en",
  "ar",
  "fr",
  "de",
  "es",
  "it",
  "pt",
  "tr",
  "ru",
  "zh",
  "hi",
  "ur",
] as const;

interface Line {
  key: number;
  start: string;
  end: string;
  text: string;
}

const lineOf = (cue: Cue, key: number): Line => ({
  key,
  start: formatCueTime(cue.start),
  end: formatCueTime(cue.end),
  text: cue.text,
});

const action =
  "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium hover:bg-accent disabled:opacity-50 [&_svg]:size-4";
const field =
  "rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:border-ring";

type Player = HTMLVideoElement & HTMLAudioElement;

/**
 * Everything a teacher writes beside a recording, in one sheet with the
 * recording at its top: its captions, its chapters and its transcript, a
 * tab each.
 */
export function RecordingSheet({
  open,
  onOpenChange,
  ...sheet
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: RecordingTab;
  onTabChange: (tab: RecordingTab) => void;
  /** The recording, whose captions can be drafted from what it says. */
  fileId: string;
  src: string | undefined;
  video: boolean;
  captionsSrc: string | undefined;
  language: string;
  onSave: (file: File, language: string) => Promise<void>;
  chapters: string;
  onChapters: (text: string) => void;
  descriptions: string;
  onDescriptions: (text: string) => void;
  transcript: string;
  onTranscript: (text: string) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup className="fixed inset-y-0 end-0 z-50 flex w-full flex-col bg-background shadow-2xl outline-none sm:max-w-[520px] sm:border-s">
          {open ? (
            <Sheet {...sheet} onDone={() => onOpenChange(false)} />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * A YouTube or Vimeo video's chapters and audio description, written beside
 * the video playing through the school's player; the service keeps its own
 * captions.
 */
export function FramedChaptersSheet({
  open,
  onOpenChange,
  ...sheet
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source: FramedSource;
  tab: RecordingTab;
  onTabChange: (tab: RecordingTab) => void;
  chapters: string;
  onChapters: (text: string) => void;
  descriptions: string;
  onDescriptions: (text: string) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/10 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <Dialog.Popup className="fixed inset-y-0 end-0 z-50 flex w-full flex-col bg-background shadow-2xl outline-none sm:max-w-[520px] sm:border-s">
          {open ? (
            <FramedChapters {...sheet} onDone={() => onOpenChange(false)} />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function FramedChapters({
  source,
  tab,
  onTabChange,
  chapters,
  onChapters,
  descriptions,
  onDescriptions,
  onDone,
}: {
  source: FramedSource;
  tab: RecordingTab;
  onTabChange: (tab: RecordingTab) => void;
  chapters: string;
  onChapters: (text: string) => void;
  descriptions: string;
  onDescriptions: (text: string) => void;
  onDone: () => void;
}) {
  const { strings, locale } = useEditorEnvironment();
  const [player, setPlayer] = useState<PlayerClock | null>(null);
  const [text, setText] = useState(chapters);
  const [described, setDescribed] = useState(descriptions);
  return (
    <>
      <div className="flex min-h-14 items-center gap-3 border-b px-4">
        <Dialog.Title className="min-w-0 flex-1 truncate text-base font-semibold">
          {strings.recordingSheet}
        </Dialog.Title>
        <Dialog.Close
          aria-label={strings.captionsClose}
          className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent [&_svg]:size-4"
        >
          <X aria-hidden />
        </Dialog.Close>
      </div>
      <div className="border-b p-4">
        <FramedVideo
          source={source}
          locale={locale}
          chapters={parseChapters(text)}
          element={setPlayer}
          autoplay={false}
        />
      </div>
      <Tabs.Root
        value={tab === "descriptions" ? "descriptions" : "chapters"}
        onValueChange={(value: RecordingTab) => onTabChange(value)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Tabs.List className="flex gap-5 border-b px-4">
          <Tabs.Tab value="chapters" className={tabClass}>
            {strings.chapters}
          </Tabs.Tab>
          <Tabs.Tab value="descriptions" className={tabClass}>
            {strings.descriptions}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel
          value="chapters"
          keepMounted
          className="flex min-h-0 flex-1 flex-col data-hidden:hidden"
        >
          <TimedLinesPanel
            kind="chapters"
            player={player}
            text={text}
            onText={(next) => {
              setText(next);
              onChapters(next);
            }}
            onDone={onDone}
          />
        </Tabs.Panel>
        <Tabs.Panel
          value="descriptions"
          keepMounted
          className="flex min-h-0 flex-1 flex-col data-hidden:hidden"
        >
          <TimedLinesPanel
            kind="descriptions"
            player={player}
            text={described}
            onText={(next) => {
              setDescribed(next);
              onDescriptions(next);
            }}
            onDone={onDone}
          />
        </Tabs.Panel>
      </Tabs.Root>
    </>
  );
}

const tabClass =
  "relative -mb-px inline-flex h-10 items-center border-b-2 border-transparent px-1 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-active:border-foreground data-active:text-foreground";
const footer =
  "flex flex-wrap items-center gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]";
const done =
  "ms-auto inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50";

/** The sheet's contents, made afresh each time it opens. */
function Sheet({
  tab,
  onTabChange,
  fileId,
  src,
  video,
  captionsSrc,
  language,
  onSave,
  chapters,
  onChapters,
  descriptions,
  onDescriptions,
  transcript,
  onTranscript,
  onDone,
}: {
  tab: RecordingTab;
  onTabChange: (tab: RecordingTab) => void;
  fileId: string;
  src: string | undefined;
  video: boolean;
  captionsSrc: string | undefined;
  language: string;
  onSave: (file: File, language: string) => Promise<void>;
  chapters: string;
  onChapters: (text: string) => void;
  descriptions: string;
  onDescriptions: (text: string) => void;
  transcript: string;
  onTranscript: (text: string) => void;
  onDone: () => void;
}) {
  const { strings, locale } = useEditorEnvironment();
  const player = useRef<Player>(null);
  // Panels follow the player once it is there; streams load it a moment later.
  const [element, setElement] = useState<Player | null>(null);
  const attach = useCallback((found: Player | null) => {
    player.current = found;
    setElement(found);
  }, []);
  const [lang, setLang] = useState(language || locale);
  const [chapterText, setChapterText] = useState(chapters);
  const [described, setDescribed] = useState(descriptions);
  const tabs: { value: RecordingTab; label: string }[] = [
    { value: "captions", label: strings.captions },
    ...(video
      ? [
          { value: "chapters" as const, label: strings.chapters },
          { value: "descriptions" as const, label: strings.descriptions },
        ]
      : []),
    { value: "transcript", label: strings.transcript },
  ];
  return (
    <>
      <div className="flex min-h-14 items-center gap-3 border-b px-4">
        <Dialog.Title className="min-w-0 flex-1 truncate text-base font-semibold">
          {strings.recordingSheet}
        </Dialog.Title>
        <Dialog.Close
          aria-label={strings.captionsClose}
          className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent [&_svg]:size-4"
        >
          <X aria-hidden />
        </Dialog.Close>
      </div>
      <div className="border-b p-4">
        <MediaPlayer
          src={src}
          captions={captionsSrc}
          captionsLang={lang}
          video={video}
          locale={locale}
          captionsLabel={strings.captions}
          element={attach}
          chapters={parseChapters(chapterText)}
        />
      </div>
      <Tabs.Root
        value={tab}
        onValueChange={(value: RecordingTab) => onTabChange(value)}
        className="flex min-h-0 flex-1 flex-col"
      >
        <Tabs.List className="flex gap-5 border-b px-4">
          {tabs.map((item) => (
            <Tabs.Tab key={item.value} value={item.value} className={tabClass}>
              {item.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
        <Tabs.Panel
          value="captions"
          keepMounted
          className="flex min-h-0 flex-1 flex-col data-hidden:hidden"
        >
          <CaptionsPanel
            player={player}
            fileId={fileId}
            captionsSrc={captionsSrc}
            lang={lang}
            onLang={setLang}
            onSave={onSave}
            onDone={onDone}
          />
        </Tabs.Panel>
        {video ? (
          <Tabs.Panel
            value="chapters"
            keepMounted
            className="flex min-h-0 flex-1 flex-col data-hidden:hidden"
          >
            <TimedLinesPanel
              kind="chapters"
              player={element}
              text={chapterText}
              onText={(text) => {
                setChapterText(text);
                onChapters(text);
              }}
              onDone={onDone}
            />
          </Tabs.Panel>
        ) : null}
        {video ? (
          <Tabs.Panel
            value="descriptions"
            keepMounted
            className="flex min-h-0 flex-1 flex-col data-hidden:hidden"
          >
            <TimedLinesPanel
              kind="descriptions"
              player={element}
              text={described}
              onText={(text) => {
                setDescribed(text);
                onDescriptions(text);
              }}
              onDone={onDone}
            />
          </Tabs.Panel>
        ) : null}
        <Tabs.Panel
          value="transcript"
          keepMounted
          className="flex min-h-0 flex-1 flex-col data-hidden:hidden"
        >
          <TranscriptPanel
            initial={transcript}
            onText={onTranscript}
            onDone={onDone}
          />
        </Tabs.Panel>
      </Tabs.Root>
    </>
  );
}

/** The second the sheet's player stands at, kept up to date as it plays. */
function usePlayerSecond(player: PlayerClock | null) {
  const [second, setSecond] = useState(0);
  useEffect(() => {
    if (!player) return undefined;
    const tick = () => setSecond(Math.floor(player.currentTime));
    player.addEventListener("timeupdate", tick);
    player.addEventListener("seeked", tick);
    return () => {
      player.removeEventListener("timeupdate", tick);
      player.removeEventListener("seeked", tick);
    };
  }, [player]);
  return second;
}

/**
 * Lines a teacher writes against a recording's time, a time and the words
 * a line: its chapters, as video sites take them, or its audio
 * description, what the picture shows from then. One is added where the
 * recording above is paused.
 */
function TimedLinesPanel({
  kind,
  player,
  text,
  onText,
  onDone,
}: {
  kind: "chapters" | "descriptions";
  player: PlayerClock | null;
  text: string;
  onText: (text: string) => void;
  onDone: () => void;
}) {
  const { strings } = useEditorEnvironment();
  const input = useRef<HTMLTextAreaElement>(null);
  const second = usePlayerSecond(player);
  const chapters = kind === "chapters";
  const parse = chapters ? parseChapters : parseDescriptions;
  const skipped = text
    .split("\n")
    .filter((line) => line.trim() && parse(line).length === 0).length;
  // A line goes where its time puts it, with its words left to write.
  const add = () => {
    const at = Math.floor(player?.currentTime ?? second);
    const lines = text ? text.split("\n") : [];
    const later = lines.findIndex((line) => (parse(line)[0]?.at ?? -1) > at);
    const place = later === -1 ? lines.length : later;
    const line = `${mediaClock(at)} `;
    const next = [...lines.slice(0, place), line, ...lines.slice(place)];
    onText(next.join("\n"));
    const caret =
      next.slice(0, place).reduce((sum, item) => sum + item.length + 1, 0) +
      line.length;
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(caret, caret);
    });
  };
  return (
    <>
      <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {chapters ? strings.chaptersHelp : strings.descriptionsHelp}
          </p>
          <button type="button" onClick={add} className={`${action} border`}>
            <Plus aria-hidden />
            {chapters
              ? strings.chapterAddAt(mediaClock(second))
              : strings.descriptionAddAt(mediaClock(second))}
          </button>
        </div>
        <textarea
          ref={input}
          aria-label={chapters ? strings.chapters : strings.descriptions}
          dir="auto"
          value={text}
          maxLength={chapters ? MAX_CHAPTER_TEXT : MAX_DESCRIPTION_TEXT}
          placeholder={
            chapters ? strings.chaptersHint : strings.descriptionsHint
          }
          onChange={(event) => onText(event.target.value)}
          className={`${field} field-sizing-content min-h-40 w-full resize-none leading-6`}
        />
        {skipped > 0 ? (
          <p className="text-xs text-warning-foreground dark:text-warning">
            {chapters
              ? strings.chaptersSkipped(skipped)
              : strings.descriptionsSkipped(skipped)}
          </p>
        ) : null}
      </div>
      <div className={footer}>
        <button type="button" onClick={onDone} className={done}>
          {strings.questionDone}
        </button>
      </div>
    </>
  );
}

/** What a recording says, written out for readers who cannot hear it. */
function TranscriptPanel({
  initial,
  onText,
  onDone,
}: {
  initial: string;
  onText: (text: string) => void;
  onDone: () => void;
}) {
  const { strings } = useEditorEnvironment();
  const [text, setText] = useState(initial);
  return (
    <>
      <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-4">
        <textarea
          aria-label={strings.transcript}
          dir="auto"
          value={text}
          maxLength={20000}
          placeholder={strings.transcriptHint}
          onChange={(event) => {
            setText(event.target.value);
            onText(event.target.value);
          }}
          className={`${field} field-sizing-content min-h-60 w-full resize-none leading-6`}
        />
      </div>
      <div className={footer}>
        <button type="button" onClick={onDone} className={done}>
          {strings.questionDone}
        </button>
      </div>
    </>
  );
}

/**
 * Captions written beside the recording: each line starts where the player
 * stands when it is added, and its times can be typed. Saving writes a
 * WebVTT file, marking right-to-left lines so players show them that way.
 */
function CaptionsPanel({
  player,
  fileId,
  captionsSrc,
  lang,
  onLang,
  onSave,
  onDone,
}: {
  player: RefObject<Player | null>;
  fileId: string;
  captionsSrc: string | undefined;
  lang: string;
  onLang: (lang: string) => void;
  onSave: (file: File, language: string) => Promise<void>;
  onDone: () => void;
}) {
  const { strings, locale, media } = useEditorEnvironment();
  const counter = useRef(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [loading, setLoading] = useState(Boolean(captionsSrc));
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const upload = useRef<HTMLInputElement>(null);

  const take = useCallback(
    (cues: Cue[]) =>
      setLines(cues.map((cue) => lineOf(cue, (counter.current += 1)))),
    [],
  );

  useEffect(() => {
    if (!captionsSrc) return;
    void fetch(captionsSrc)
      .then((response) => (response.ok ? response.text() : ""))
      .then((text) => take(parseVtt(text)))
      .catch(() => take([]))
      .finally(() => setLoading(false));
  }, [captionsSrc, take]);

  // A draft from speech: asked for here, followed until it is made, and
  // taken into the lines once it is, for the teacher to check.
  const drafting = media?.captions;
  const [draft, setDraft] = useState<CaptionDraftStatus | null>(null);
  const [asked, setAsked] = useState(false);
  const [drafted, setDrafted] = useState(false);
  useEffect(() => {
    if (!drafting) return undefined;
    let gone = false;
    void drafting
      .status(fileId)
      .then((found) => {
        if (!gone) setDraft(found);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [drafting, fileId]);
  const waiting =
    draft?.draft?.state === "queued" || draft?.draft?.state === "working";
  useEffect(() => {
    if (!drafting || !waiting) return undefined;
    const timer = setInterval(() => {
      void drafting
        .status(fileId)
        .then((found) => {
          setDraft(found);
          if (asked && found.draft?.state === "ready" && found.draft.vtt) {
            take(parseVtt(found.draft.vtt));
            setDrafted(true);
            setAsked(false);
          }
        })
        .catch(() => undefined);
    }, DRAFT_POLL_MS);
    return () => clearInterval(timer);
  }, [drafting, waiting, fileId, asked, take]);
  const speech = SPEECH_LANGUAGES.find((language) => language === lang) ?? null;
  const askDraft = async () => {
    if (!drafting || !speech) return;
    setProblem(null);
    try {
      await drafting.draft(fileId, speech);
      setAsked(true);
      setDraft({
        available: true,
        draft: { state: "queued", progress: null, vtt: null },
      });
    } catch {
      setProblem(strings.captionsDraftFailed);
    }
  };
  const ready = draft?.draft?.state === "ready" ? draft.draft.vtt : null;

  const names = new Intl.DisplayNames([locale], { type: "language" });
  const choices = LANGUAGES.includes(lang as (typeof LANGUAGES)[number])
    ? LANGUAGES
    : [lang, ...LANGUAGES];

  const addLine = () => {
    const now = player.current?.currentTime ?? 0;
    const next = lines
      .map((line) => parseCueTime(line.start))
      .filter((start): start is number => start !== null && start > now)
      .toSorted((a, b) => a - b)[0];
    const end = Math.min(now + 3, next ?? Number.POSITIVE_INFINITY);
    counter.current += 1;
    const line = lineOf(
      { start: now, end: end > now ? end : now + 3, text: "" },
      counter.current,
    );
    setLines((current) =>
      [...current, line].toSorted(
        (a, b) => (parseCueTime(a.start) ?? 0) - (parseCueTime(b.start) ?? 0),
      ),
    );
  };

  const change = (key: number, patch: Partial<Line>) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

  const save = async (cues: Cue[]) => {
    setSaving(true);
    setProblem(null);
    try {
      await onSave(
        new File([vttOf(cues)], "captions.vtt", { type: "text/vtt" }),
        lang,
      );
      onDone();
    } catch {
      setProblem(strings.uploadFailed);
    } finally {
      setSaving(false);
    }
  };

  const submit = () => {
    const cues: Cue[] = [];
    for (const line of lines) {
      const start = parseCueTime(line.start);
      const end = parseCueTime(line.end);
      if (!line.text.trim()) continue;
      if (start === null || end === null || end <= start) {
        setProblem(strings.captionsTimeProblem);
        return;
      }
      cues.push({ start, end, text: line.text });
    }
    void save(cues);
  };

  return (
    <>
      <div className="grid gap-3 border-b p-4">
        <p className="text-xs text-muted-foreground">{strings.captionsHint}</p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addLine}
            className={`${action} border`}
          >
            <Plus aria-hidden />
            {strings.captionsAddLine}
          </button>
          {draft?.available && speech && !waiting ? (
            <button
              type="button"
              onClick={() => void askDraft()}
              className={`${action} border`}
            >
              <AudioLines aria-hidden />
              {strings.captionsDraft}
            </button>
          ) : null}
          <label className="ms-auto inline-flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {strings.captionsLanguage}
            </span>
            <select
              value={lang}
              onChange={(event) => onLang(event.target.value)}
              className="h-9 rounded-md border bg-background px-2 text-sm"
            >
              {choices.map((code) => (
                <option key={code} value={code}>
                  {names.of(code) ?? code}
                </option>
              ))}
            </select>
          </label>
        </div>
        {draft?.available && speech && waiting ? (
          <output className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            {draft.draft?.state === "working" && draft.draft.progress !== null
              ? strings.captionsDrafting(Math.round(draft.draft.progress * 100))
              : strings.captionsDraftWaiting}
          </output>
        ) : null}
        {ready && !drafted && lines.length === 0 && !loading ? (
          <button
            type="button"
            onClick={() => {
              take(parseVtt(ready));
              setDrafted(true);
            }}
            className={`${action} justify-self-start`}
          >
            {strings.captionsUseDraft}
          </button>
        ) : null}
        {draft?.draft?.state === "failed" ? (
          <p className="text-xs text-destructive">
            {strings.captionsDraftFailed}
          </p>
        ) : null}
        {drafted ? (
          <p className="rounded-md bg-warning/10 px-3 py-2 text-xs leading-5 text-warning-foreground dark:text-warning">
            {strings.captionsDraftNote}
          </p>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading ? (
          <div aria-busy="true" className="min-h-24" />
        ) : lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {strings.captionsEmpty}
          </p>
        ) : (
          <ol className="grid gap-3">
            {lines.map((line, index) => (
              <li key={line.key} className="grid gap-2 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <input
                    aria-label={strings.captionsStart(index + 1)}
                    value={line.start}
                    inputMode="decimal"
                    dir="ltr"
                    onChange={(event) =>
                      change(line.key, { start: event.target.value })
                    }
                    onFocus={() => {
                      const at = parseCueTime(line.start);
                      if (player.current && at !== null)
                        player.current.currentTime = at;
                    }}
                    className={`${field} w-24 tabular-nums`}
                  />
                  <span aria-hidden className="text-muted-foreground">
                    –
                  </span>
                  <input
                    aria-label={strings.captionsEnd(index + 1)}
                    value={line.end}
                    inputMode="decimal"
                    dir="ltr"
                    onChange={(event) =>
                      change(line.key, { end: event.target.value })
                    }
                    className={`${field} w-24 tabular-nums`}
                  />
                  <button
                    type="button"
                    aria-label={strings.captionsRemoveLine(index + 1)}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((item) => item.key !== line.key),
                      )
                    }
                    className="ms-auto inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-4"
                  >
                    <Trash2 aria-hidden />
                  </button>
                </div>
                <textarea
                  aria-label={strings.captionsLineText(index + 1)}
                  value={line.text}
                  dir="auto"
                  rows={2}
                  maxLength={500}
                  onChange={(event) =>
                    change(line.key, { text: event.target.value })
                  }
                  className={`${field} field-sizing-content min-h-12 w-full resize-none`}
                />
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={saving}
          onClick={() => upload.current?.click()}
          className={action}
        >
          <Upload aria-hidden />
          {strings.captionsUpload}
        </button>
        <input
          ref={upload}
          type="file"
          accept=".vtt,text/vtt"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) take(parseVtt(await file.text()));
          }}
        />
        {problem ? (
          <p role="alert" className="text-xs text-destructive">
            {problem}
          </p>
        ) : null}
        <button
          type="button"
          disabled={saving || loading}
          onClick={submit}
          className="ms-auto inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? strings.uploading : strings.captionsSave}
        </button>
      </div>
    </>
  );
}
