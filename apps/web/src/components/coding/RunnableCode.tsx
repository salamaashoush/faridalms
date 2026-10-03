import type { RunnableProps } from "@faridalms/editor/view";

import { Info } from "lucide-react";
import { useContext, useEffect, useRef, useState } from "react";

import * as m from "~/i18n/messages";

import { CodeRunner } from "./CodeRunner";
import { OwnCodeContext } from "./own-code";
import { runLanguage } from "./runner/runner";

/** How long typing pauses before a student's changes are kept. */
const KEEP_MS = 1500;

/** Changes not yet kept, and where they go. */
interface Keeping {
  code: string | null;
  timer: ReturnType<typeof setTimeout> | undefined;
  keep: ((code: string) => void) | null;
}

// The lesson editor indents code with tabs and the student's editor with
// four spaces; Python refuses a block that mixes the two.
const programOf = (source: string) =>
  source.replace(/^\t+/gm, (tabs) => "    ".repeat(tabs.length));

function flush(keeping: Keeping) {
  clearTimeout(keeping.timer);
  if (keeping.code !== null) keeping.keep?.(keeping.code);
  keeping.code = null;
}

/**
 * A code block a student can change and run, with what it prints below it.
 * A block that waits for a prediction stays locked until the question above
 * it is answered. In a student's lesson their changes are kept, and come
 * back with them.
 */
export function RunnableCode({
  blockId,
  source,
  language,
  drawn,
  locked,
}: RunnableProps) {
  const own = useContext(OwnCodeContext);
  const kept = blockId ? own?.codes[blockId] : undefined;
  const [outdated, setOutdated] = useState(
    () => Boolean(kept?.changed) && kept?.code !== programOf(source),
  );
  const keeping = useRef<Keeping>({ code: null, timer: undefined, keep: null });
  useEffect(() => {
    keeping.current.keep =
      own && blockId ? (code) => own.keep(blockId, code) : null;
  });
  // Changes typed just before the student leaves are kept as they go.
  useEffect(() => {
    const current = keeping.current;
    return () => flush(current);
  }, []);

  const kind = language === "html" ? "html" : runLanguage(language);
  if (!kind) return drawn;
  const program = programOf(source);
  const runner = (
    <CodeRunner
      // A block whose code changes gets an editor of its own.
      key={program}
      source={program}
      initial={kept?.code ?? program}
      language={kind}
      drawn={drawn}
      locked={locked}
      onChange={(code) => {
        if (code === program) setOutdated(false);
        const current = keeping.current;
        current.code = code;
        clearTimeout(current.timer);
        current.timer = setTimeout(() => flush(current), KEEP_MS);
      }}
      onRan={() => flush(keeping.current)}
      className={outdated ? undefined : "my-3"}
    />
  );
  return outdated ? (
    <div className="my-3 grid gap-1.5">
      <p className="flex gap-2 text-[13px] leading-[18px] text-muted-foreground">
        <Info aria-hidden className="mt-px size-4 shrink-0" />
        {m.codeKeptChanged()}
      </p>
      {runner}
    </div>
  ) : (
    runner
  );
}
