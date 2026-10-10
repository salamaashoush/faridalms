import type { ProjectFile } from "@faridalms/domain/project";

import { programOf } from "@faridalms/makecode/project";

import * as m from "~/i18n/messages";

/**
 * A micro:bit project where it is not open: its program as the text its
 * blocks come to, to read at a glance. Running it takes the board's own
 * editor, which is too large to load for every project on a page.
 */
export function DeviceProgram({ files }: { files: readonly ProjectFile[] }) {
  const program = programOf(files);
  const code = program?.code.trim() ?? "";
  if (!program || code === "")
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm leading-5 text-muted-foreground">
        {m.deviceProgramEmpty()}
      </p>
    );
  return (
    <figure className="grid gap-1.5">
      <figcaption
        dir="ltr"
        className="font-mono text-[13px] leading-[18px] text-muted-foreground"
      >
        {program.name}
      </figcaption>
      <pre
        dir="ltr"
        className="max-h-64 overflow-auto rounded-lg border bg-muted/40 px-3 py-2 font-mono text-[13px] leading-5 [font-variant-ligatures:none]"
      >
        <code>{code}</code>
      </pre>
    </figure>
  );
}
