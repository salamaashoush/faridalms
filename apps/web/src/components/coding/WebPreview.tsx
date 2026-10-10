import { cn } from "@faridalms/ui/cn";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import * as m from "~/i18n/messages";
import { playQuery } from "~/queries/play";
import { formatNumber } from "~/utils/datetime";

import type { PageSource } from "./project-page";

import { friendlyError } from "./friendly";
import {
  ERROR_HIDDEN,
  LOOP_SECONDS,
  LOOP_STOPPED,
  playablePage,
} from "./web-page";

type Entry = {
  id: number;
  kind: "log" | "info" | "warn" | "error";
  text: string;
  line: number | null;
  /** The project's file the line is in, for a page made of several. */
  file: string | null;
};

/**
 * A student's web page as the browser draws it, played on the files host's
 * own domain, with what it writes to its console below. Each run starts the
 * page afresh.
 */
export function WebPreview({
  page,
  onOpen,
  fill = false,
}: {
  /**
   * A new page object plays the page again, even when its code is the
   * same. A page made of several files says which one each of its lines
   * was written in.
   */
  page: { html: string; sourceAt?: (line: number) => PageSource };
  /** Follows a link the page's reader chose; false when it leads nowhere here. */
  onOpen?: (href: string) => boolean;
  /** Takes all the room it is given, rather than a set height. */
  fill?: boolean;
}) {
  const play = useQuery(playQuery).data;
  const frame = useRef<HTMLIFrameElement>(null);
  // Whether the browser hides a page's errors from it, once the play page
  // has found out; until then no page is shown.
  const [hides, setHides] = useState<boolean | null>(null);
  // The console belongs to the page it came from; a new page starts it empty.
  const [log, setLog] = useState<{ page: object | null; entries: Entry[] }>({
    page: null,
    entries: [],
  });
  const entries = log.page === page ? log.entries : [];
  const showing = useEffectEvent(() => page);
  const open = useEffectEvent((href: string) => onOpen?.(href) ?? false);

  const show = useEffectEvent((html: string) => {
    // The play page is sandboxed to an opaque origin, which no target
    // origin names; it is reached through its own frame's window.
    frame.current?.contentWindow?.postMessage(
      {
        type: "show",
        html: playablePage(html, hides ?? false),
        title: m.codePage(),
      },
      "*",
    );
  });

  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow)
        return;
      const data = event.data as {
        type?: string;
        kind?: Entry["kind"];
        text?: string;
        line?: number | null;
        href?: string;
        hidden?: boolean;
      };
      if (data.type === "ready") setHides(Boolean(data.hidden));
      const said =
        data.type === "open" && typeof data.href === "string"
          ? open(data.href)
            ? null
            : { kind: "info" as const, text: m.codeLinkLeaves(), line: null }
          : data.type === "console" && typeof data.text === "string"
            ? {
                kind: data.kind ?? "log",
                text: data.text,
                line: data.line ?? null,
              }
            : null;
      if (said) {
        const now = showing();
        const source =
          said.line === null ? null : (now.sourceAt?.(said.line) ?? null);
        setLog((current) => {
          const list = current.page === now ? current.entries : [];
          if (list.length >= 200) return current;
          return {
            page: now,
            entries: [
              ...list,
              {
                id: (list.at(-1)?.id ?? 0) + 1,
                kind: said.kind,
                text: said.text,
                line: source?.line ?? said.line,
                file: source?.file ?? null,
              },
            ],
          };
        });
      }
    };
    addEventListener("message", listen);
    return () => removeEventListener("message", listen);
  }, []);

  useEffect(() => {
    if (hides !== null) show(page.html);
  }, [hides, page]);

  if (!play)
    return (
      <p
        dir="auto"
        className="border-t px-3 py-2.5 text-[13px] leading-[18px] text-muted-foreground"
      >
        {m.codePlayMissing()}
      </p>
    );
  return (
    <div className={fill ? "flex min-h-0 flex-1 flex-col" : "grid border-t"}>
      <iframe
        ref={frame}
        src={`${play.origin}/play`}
        title={m.codePage()}
        // The play page holds the student's page in a frame of its own;
        // both have opaque origins, on another site from the school's.
        sandbox="allow-scripts allow-modals allow-forms"
        className={cn("w-full bg-white", fill ? "min-h-0 flex-1" : "h-72")}
      />
      {entries.length > 0 ? (
        <div className="grid shrink-0 gap-1 border-t bg-muted/30 px-3 py-2.5">
          <p
            dir="auto"
            className="text-[13px] leading-[18px] font-medium text-muted-foreground"
          >
            {m.codeConsole()}
          </p>
          <ul
            dir="ltr"
            className="grid max-h-48 gap-0.5 overflow-auto font-mono text-[13px] leading-5 [font-variant-ligatures:none]"
          >
            {entries.map((entry) => (
              <ConsoleEntry key={entry.id} entry={entry} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ConsoleEntry({ entry }: { entry: Entry }) {
  if (entry.text.endsWith(LOOP_STOPPED))
    return (
      <li dir="auto" className="font-sans text-destructive">
        {m.codeLoopStopped({ seconds: formatNumber(LOOP_SECONDS) })}
      </li>
    );
  if (entry.text === ERROR_HIDDEN && entry.line === null)
    return (
      <li dir="auto" className="font-sans text-destructive">
        {m.codeErrorHidden()}
      </li>
    );
  const name = /^(?:Uncaught )?(\w+Error)\b/.exec(entry.text)?.[1];
  const why =
    entry.kind === "error" && name ? friendlyError("javascript", name) : null;
  return (
    <li
      className={
        entry.kind === "error"
          ? "text-destructive"
          : entry.kind === "warn"
            ? "text-warning-foreground dark:text-warning"
            : undefined
      }
    >
      <span className="[overflow-wrap:anywhere] whitespace-pre-wrap">
        {entry.line === null
          ? entry.text
          : entry.file === null
            ? m.codeErrorAt({
                line: formatNumber(entry.line),
                message: entry.text,
              })
            : m.codeErrorIn({
                file: entry.file,
                line: formatNumber(entry.line),
                message: entry.text,
              })}
      </span>
      {why ? (
        <span dir="auto" className="block font-sans text-muted-foreground">
          {why}
        </span>
      ) : null}
    </li>
  );
}
