import type { NodeKey } from "lexical";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $isElementNode,
  createCommand,
  isHTMLElement,
} from "lexical";
import { LoaderCircle, Mic, Trash2, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useEditorEnvironment } from "../context";
import { MediaPlayer } from "../media-view";
import { $narrationOf } from "../nodes/narration";
import { VoiceRecorder } from "../recorder";

/** Opens the floating bar's narration panel for the block or part with this key. */
export const OPEN_NARRATION_COMMAND = createCommand<NodeKey>("OPEN_NARRATION");

/** The longest recording a teacher may give a block, as Seesaw caps a voice note. */
export const NARRATION_SECONDS = 180;

/**
 * Marks each narrated block and part in the editor, so the teacher sees
 * which ones children will hear without opening any of them.
 */
export function NarrationMarksPlugin() {
  const [editor] = useLexicalComposerContext();
  const { narration } = useEditorEnvironment();
  useEffect(() => {
    if (!narration) return undefined;
    let marked = new Set<HTMLElement>();
    const mark = () => {
      const keys = editor.getEditorState().read(() => {
        const found: NodeKey[] = [];
        const pending = [...$getRoot().getChildren()];
        for (let node = pending.pop(); node; node = pending.pop()) {
          if ($narrationOf(node)) found.push(node.getKey());
          if ($isElementNode(node)) pending.push(...node.getChildren());
        }
        return found;
      });
      const now = new Set(
        keys.map((key) => editor.getElementByKey(key)).filter(isHTMLElement),
      );
      for (const element of marked)
        if (!now.has(element)) delete element.dataset.narrated;
      for (const element of now) element.dataset.narrated = "";
      marked = now;
    };
    mark();
    return editor.registerUpdateListener(mark);
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

/**
 * Records, uploads, plays or removes the narration of one block or part.
 * The recording is stored first and only then put on the block, so a
 * failed upload leaves the block as it was.
 */
export function NarrationPanel({
  fileId,
  onChange,
  onClose,
}: {
  fileId: string | null;
  onChange: (fileId: string | null) => void;
  onClose: () => void;
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
