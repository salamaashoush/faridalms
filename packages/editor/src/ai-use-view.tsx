import type { AiEvidence } from "@faridalms/domain/content";

import { formatDayIn } from "@faridalms/domain/school";
import { ChevronDown, Paperclip, Sparkles } from "lucide-react";

import type { FileStrings } from "./files";
import type { EditorStrings } from "./strings";

import { FileCard } from "./files";

export type AiUseViewStrings = FileStrings &
  Pick<
    EditorStrings,
    | "aiUse"
    | "aiUseTool"
    | "aiUseDate"
    | "aiUsePrompt"
    | "aiUseHow"
    | "aiUseEvidence"
  >;

export interface AiUseFields {
  tool: string;
  date: string;
  prompt: string;
  use: string;
  evidence: AiEvidence[];
}

/**
 * How an acknowledgement reads: the tool and date, what was asked and how
 * the answer was used, and the evidence kept. Shared by the editor's
 * read-only state and the document reader, which must not load Lexical.
 */
export function AiUseView({
  fields,
  strings,
  locale,
  url,
}: {
  fields: AiUseFields;
  strings: AiUseViewStrings;
  locale: string;
  url: (fileId: string) => string | undefined;
}) {
  const facts = [
    { label: strings.aiUsePrompt, value: fields.prompt },
    { label: strings.aiUseHow, value: fields.use },
  ].filter((fact) => fact.value);
  // A citation reads as one line in the work and opens to what was asked,
  // how the answer was used, and the evidence kept.
  return (
    <details className="fe-ai-use group my-3 rounded-lg border bg-muted/30">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/60 [&::-webkit-details-marker]:hidden">
        <Sparkles
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
        <span className="font-medium">{strings.aiUse}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {fields.tool ? <bdi>{fields.tool}</bdi> : null}
          {fields.tool && fields.date ? " · " : null}
          {fields.date ? (
            <bdi>{formatDayIn(fields.date, "full", locale)}</bdi>
          ) : null}
        </span>
        {fields.evidence.length ? (
          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <Paperclip className="size-3.5" aria-hidden />
            <span aria-label={strings.aiUseEvidence}>
              {fields.evidence.length.toLocaleString(locale)}
            </span>
          </span>
        ) : null}
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="grid gap-3 px-3 pt-1 pb-3">
        {facts.length ? (
          <dl className="grid gap-3 text-sm">
            {facts.map((fact) => (
              <div key={fact.label} className="grid gap-0.5">
                <dt className="text-[13px] leading-[18px] text-muted-foreground">
                  {fact.label}
                </dt>
                <dd dir="auto" className="whitespace-pre-wrap">
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {fields.evidence.length ? (
          <div className="grid gap-2">
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {strings.aiUseEvidence}
            </p>
            {fields.evidence.map((file) => (
              <FileCard
                key={file.fileId}
                file={file}
                url={url(file.fileId)}
                strings={strings}
                locale={locale}
              />
            ))}
          </div>
        ) : null}
      </div>
    </details>
  );
}
