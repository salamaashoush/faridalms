import type { Cue } from "@faridalms/domain/captions";

import { Dialog } from "@base-ui/react/dialog";
import {
  formatCueTime,
  parseCueTime,
  parseVtt,
  vttOf,
} from "@faridalms/domain/captions";
import { Plus, Trash2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useEditorEnvironment } from "./context";

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

/**
 * Captions written beside the recording: each line starts where the player
 * stands when it is added, and its times can be typed. Saving writes a
 * WebVTT file, marking right-to-left lines so players show them that way.
 */
export function CaptionsEditor({
  open,
  onOpenChange,
  ...sheet
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  src: string | undefined;
  video: boolean;
  captionsSrc: string | undefined;
  language: string;
  onSave: (file: File, language: string) => Promise<void>;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="fixed inset-y-0 end-0 z-50 flex w-full flex-col bg-background shadow-2xl outline-none sm:max-w-[520px] sm:border-s">
          <CaptionsSheet {...sheet} onDone={() => onOpenChange(false)} />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The sheet's contents, made afresh each time it opens. */
function CaptionsSheet({
  src,
  video,
  captionsSrc,
  language,
  onSave,
  onDone,
}: {
  src: string | undefined;
  video: boolean;
  captionsSrc: string | undefined;
  language: string;
  onSave: (file: File, language: string) => Promise<void>;
  onDone: () => void;
}) {
  const { strings, locale } = useEditorEnvironment();
  const player = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const counter = useRef(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [lang, setLang] = useState(language || locale);
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
      <div className="flex min-h-14 items-center gap-3 border-b px-4">
        <Dialog.Title className="min-w-0 flex-1 truncate text-base font-semibold">
          {strings.captions}
        </Dialog.Title>
        <Dialog.Close
          aria-label={strings.captionsClose}
          className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent [&_svg]:size-4"
        >
          <X aria-hidden />
        </Dialog.Close>
      </div>
      <div className="grid gap-3 border-b p-4">
        {video ? (
          <video
            ref={player}
            src={src}
            controls
            preload="metadata"
            crossOrigin="anonymous"
            className="aspect-video w-full rounded-lg bg-black"
          >
            <track
              kind="captions"
              src={captionsSrc}
              srcLang={lang}
              label={strings.captions}
              default={Boolean(captionsSrc)}
            />
          </video>
        ) : (
          <audio
            ref={player}
            src={src}
            controls
            preload="metadata"
            crossOrigin="anonymous"
            className="w-full"
          >
            <track
              kind="captions"
              src={captionsSrc}
              srcLang={lang}
              label={strings.captions}
              default={Boolean(captionsSrc)}
            />
          </audio>
        )}
        <Dialog.Description className="text-xs text-muted-foreground">
          {strings.captionsHint}
        </Dialog.Description>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={addLine}
            className={`${action} border`}
          >
            <Plus aria-hidden />
            {strings.captionsAddLine}
          </button>
          <label className="ms-auto inline-flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {strings.captionsLanguage}
            </span>
            <select
              value={lang}
              onChange={(event) => setLang(event.target.value)}
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
