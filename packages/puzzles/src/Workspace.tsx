import type { Ref } from "react";

import { cn } from "@faridalms/ui/cn";
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import type { Editor } from "./blockly/editor";
import type { Level } from "./level";
import type { Program } from "./program";
import type { Place } from "./run";
import type { PuzzleStrings } from "./strings";

/** Below this width the tray of blocks goes under the workspace. */
const NARROW = 560;

/** How a puzzle's page tells the block editor about itself. */
export interface EditorSetting {
  rtl: boolean;
  arabic: boolean;
  /** Where the block editor's own pictures and cursors are served from. */
  media: string;
}

/** What a puzzle asks of its block editor from outside. */
export interface WorkspaceHandle {
  /** The program as its blocks stand this moment; null before the editor is up. */
  read: () => Program | null;
}

/**
 * The block editor on a puzzle's program. The editor is large, so it is
 * fetched when a puzzle first needs it, and until then the place it will
 * take says it is on its way.
 */
export function Workspace({
  ref,
  level,
  program,
  onChange,
  at,
  locked,
  setting,
  strings,
}: {
  ref?: Ref<WorkspaceHandle>;
  level: Pick<Level, "style" | "blocks" | "limit">;
  program: Program;
  /** Absent where the program is only read. */
  onChange?: (program: Program, used: number) => void;
  /** The block being carried out as the run plays. */
  at: Place | null;
  /** Kept from change for now, as while a run plays. */
  locked: boolean;
  setting: EditorSetting;
  strings: PuzzleStrings;
}) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<Editor | null>(null);
  const [ready, setReady] = useState(false);
  const [narrow, setNarrow] = useState<boolean | null>(null);
  const readOnly = onChange === undefined;
  useImperativeHandle(
    ref,
    () => ({ read: () => editor.current?.read() ?? null }),
    [],
  );
  const changed = useEffectEvent((next: Program, used: number) =>
    onChange?.(next, used),
  );
  // The editor opens on the program as it stands, and follows it below.
  const opening = useEffectEvent(() => ({ program, strings, locked }));
  const blocks = level.blocks.join(" ");

  useEffect(() => {
    const element = host.current;
    if (!element) return undefined;
    const measured = new ResizeObserver(([entry]) => {
      if (entry) setNarrow(entry.contentRect.width < NARROW);
    });
    measured.observe(element);
    return () => measured.disconnect();
  }, []);

  useEffect(() => {
    const element = host.current;
    if (!element || narrow === null) return undefined;
    let cancelled = false;
    void import("./blockly/editor").then(({ createEditor }) => {
      if (cancelled) return;
      const start = opening();
      editor.current = createEditor(element, {
        level: {
          style: level.style,
          blocks: blocks === "" ? [] : (blocks.split(" ") as Level["blocks"]),
          limit: level.limit,
        },
        program: start.program,
        rtl: setting.rtl,
        arabic: setting.arabic,
        narrow,
        media: setting.media,
        strings: start.strings,
        readOnly,
        onChange: (next, used) => changed(next, used),
      });
      if (start.locked) editor.current.lock(true);
      setReady(true);
    });
    return () => {
      cancelled = true;
      editor.current?.dispose();
      editor.current = null;
      setReady(false);
    };
  }, [
    blocks,
    level.style,
    level.limit,
    narrow,
    readOnly,
    setting.rtl,
    setting.arabic,
    setting.media,
  ]);

  useEffect(() => {
    if (ready) editor.current?.load(program);
  }, [ready, program]);
  useEffect(() => {
    if (ready) editor.current?.highlight(at);
  }, [ready, at]);
  useEffect(() => {
    if (ready && !readOnly) editor.current?.lock(locked);
  }, [ready, readOnly, locked]);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border bg-card",
        // A program only read needs no room to build in, nor a tray.
        readOnly ? "h-64" : narrow ? "h-[26rem]" : "h-[24rem]",
      )}
    >
      <div ref={host} data-puzzle-workspace="" className="absolute inset-0" />
      {ready ? null : (
        <p className="absolute inset-0 flex items-center justify-center text-sm leading-5 text-muted-foreground">
          {strings.loading}
        </p>
      )}
    </div>
  );
}
