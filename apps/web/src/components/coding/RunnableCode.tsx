import type { RunnableProps } from "@faridalms/editor/view";

import { CodeRunner } from "./CodeRunner";
import { runLanguage } from "./runner/runner";

/**
 * A code block a student can change and run, with what it prints below it.
 * A block that waits for a prediction stays locked until the question above
 * it is answered.
 */
export function RunnableCode({
  source,
  language,
  drawn,
  locked,
}: RunnableProps) {
  const kind = language === "html" ? "html" : runLanguage(language);
  if (!kind) return drawn;
  // The lesson editor indents code with tabs and the student's editor with
  // four spaces; Python refuses a block that mixes the two.
  const program = source.replace(/^\t+/gm, (tabs) =>
    "    ".repeat(tabs.length),
  );
  return (
    <CodeRunner
      // A block whose code changes gets an editor of its own.
      key={program}
      source={program}
      language={kind}
      drawn={drawn}
      locked={locked}
      className="my-3"
    />
  );
}
