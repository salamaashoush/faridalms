import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef, useState } from "react";

import * as m from "~/i18n/messages";
import { playQuery } from "~/queries/play";
import { formatNumber } from "~/utils/datetime";

import { friendlyError } from "./friendly";
import { LOOP_SECONDS, LOOP_STOPPED, playablePage } from "./web-page";

type Entry = {
  id: number;
  kind: "log" | "info" | "warn" | "error";
  text: string;
  line: number | null;
};

/**
 * A student's web page as the browser draws it, played on the files host's
 * own domain, with what it writes to its console below. Each run starts the
 * page afresh.
 */
export function WebPreview({
  page,
}: {
  /** A new page object plays the page again, even when its code is the same. */
  page: { html: string };
}) {
  const play = useQuery(playQuery).data;
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  // The console belongs to the page it came from; a new page starts it empty.
  const [log, setLog] = useState<{ page: object | null; entries: Entry[] }>({
    page: null,
    entries: [],
  });
  const entries = log.page === page ? log.entries : [];
  const showing = useEffectEvent(() => page);

  const show = useEffectEvent((html: string) => {
    // The play page is sandboxed to an opaque origin, which no target
    // origin names; it is reached through its own frame's window.
    frame.current?.contentWindow?.postMessage(
      { type: "show", html: playablePage(html), title: m.codePage() },
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
      };
      if (data.type === "ready") setReady(true);
      if (data.type === "console" && typeof data.text === "string") {
        const text = data.text;
        const now = showing();
        setLog((current) => {
          const list = current.page === now ? current.entries : [];
          if (list.length >= 200) return current;
          return {
            page: now,
            entries: [
              ...list,
              {
                id: (list.at(-1)?.id ?? 0) + 1,
                kind: data.kind ?? "log",
                text,
                line: data.line ?? null,
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
    if (ready) show(page.html);
  }, [ready, page]);

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
    <div className="grid border-t">
      <iframe
        ref={frame}
        src={`${play.origin}/play`}
        title={m.codePage()}
        // The play page holds the student's page in a frame of its own;
        // both have opaque origins, on another site from the school's.
        sandbox="allow-scripts allow-modals allow-forms"
        className="h-72 w-full bg-white"
      />
      {entries.length > 0 ? (
        <div className="grid gap-1 border-t bg-muted/30 px-3 py-2.5">
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
          : m.codeErrorAt({
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
