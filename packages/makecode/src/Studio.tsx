import type { Ref } from "react";

import { cn } from "@faridalms/ui/cn";
import { LoaderCircle } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import type { CodeFile } from "./project";
import type { EditorStrings } from "./strings";

import { filesOf } from "./project";
import { editorUrl, fromEditor, heard, saveNow, synced } from "./protocol";

/** How long the editor's page has to say it is there before it is given up on. */
const MISSING_MS = 20_000;
/** How long the editor has to hand over its project when asked to. */
const FLUSH_MS = 2500;

/** What a studio asks of the editor's frame from outside. */
export interface EditorHandle {
  /**
   * Has the editor hand over the project as it stands, and resolves once
   * it has, or once it has taken too long to.
   */
  flush: () => Promise<void>;
}

const sameFiles = (a: readonly CodeFile[], b: readonly CodeFile[]) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Has the browser save a compiled program, to copy onto the device. */
function download(name: string, hex: string) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(
    new Blob([hex], { type: "application/octet-stream" }),
  );
  link.href = url;
  // The name comes from the project, which is a student's to choose.
  link.download = `${name.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 60) || "microbit"}.hex`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * The micro:bit editor in a frame, on a project of kept files. The files
 * host serves the editor on another site from the school's, so it keeps
 * its own origin there for the storage and workers it needs and nothing of
 * ours. It is told the page around it is its host: it asks this page for
 * its project, tells it of every change, and hands over what it compiles
 * instead of downloading it. Messages are taken only from the frame itself
 * at the files host's origin. The simulator inside it runs the student's
 * program on that same origin, so a program could put words in the
 * editor's mouth; all it could say is a project or a file to download,
 * which is what a student may make anyway.
 */
export function EditorFrame({
  ref,
  origin,
  files,
  language,
  readOnly = false,
  onChange,
  onBack,
  strings,
  className,
}: {
  ref?: Ref<EditorHandle>;
  /** The files host, as the browser reaches it. */
  origin: string;
  /** The project the editor opens on. */
  files: readonly CodeFile[];
  language: string;
  /** Looked at and run, never changed. */
  readOnly?: boolean;
  /** The project as it now stands, each time the editor says it changed. */
  onChange?: (files: CodeFile[]) => void;
  /** The editor's own back arrow was pressed. */
  onBack?: () => void;
  strings: EditorStrings;
  className?: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<"loading" | "open" | "missing">("loading");
  const [project] = useState(() => crypto.randomUUID());
  const version = useRef("0.0.0");
  const opened = useRef(files);
  const last = useRef(files);
  const flushing = useRef(new Map<string, () => void>());

  const post = (message: unknown) =>
    frame.current?.contentWindow?.postMessage(message, origin);
  const receive = useEffectEvent((data: unknown) => {
    const said = fromEditor(data);
    if (!said) return;
    switch (said.kind) {
      case "hello":
        version.current = said.version;
        break;
      case "sync":
        post(
          synced(said.id, opened.current, {
            id: project,
            version: version.current,
            now: Math.floor(Date.now() / 1000),
          }),
        );
        break;
      case "asked":
        post(heard(said.id));
        break;
      case "loaded":
        if (said.id) post(heard(said.id));
        setState("open");
        break;
      case "save": {
        const next = filesOf(said.text);
        if (readOnly || sameFiles(next, last.current)) break;
        last.current = next;
        onChange?.(next);
        break;
      }
      case "program":
        download(said.name, said.hex);
        break;
      case "done":
        flushing.current.get(said.id)?.();
        break;
      case "back":
        onBack?.();
        break;
    }
  });

  useImperativeHandle(
    ref,
    () => ({
      flush: () =>
        new Promise<void>((resolve) => {
          const id = crypto.randomUUID();
          const settle = () => {
            window.clearTimeout(waiting);
            flushing.current.delete(id);
            resolve();
          };
          const waiting = window.setTimeout(settle, FLUSH_MS);
          flushing.current.set(id, settle);
          frame.current?.contentWindow?.postMessage(saveNow(id), origin);
        }),
    }),
    [origin],
  );

  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (
        event.origin === origin &&
        event.source === frame.current?.contentWindow
      )
        receive(event.data);
    };
    window.addEventListener("message", listen);
    const waiting = window.setTimeout(
      () => setState((now) => (now === "loading" ? "missing" : now)),
      MISSING_MS,
    );
    return () => {
      window.removeEventListener("message", listen);
      window.clearTimeout(waiting);
    };
  }, [origin]);

  return (
    <div className={cn("relative size-full", className)}>
      <iframe
        ref={frame}
        src={editorUrl(origin, { language, readOnly })}
        title={strings.title}
        allow="autoplay"
        sandbox="allow-scripts allow-same-origin allow-modals"
        className="size-full border-0"
      />
      {state === "open" ? null : (
        <p
          role={state === "missing" ? "alert" : "status"}
          className="absolute inset-0 flex items-center justify-center gap-2 bg-background px-6 text-center text-sm leading-5 text-muted-foreground"
        >
          {state === "loading" ? (
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
          ) : null}
          {state === "loading" ? strings.loading : strings.missing}
        </p>
      )}
    </div>
  );
}
