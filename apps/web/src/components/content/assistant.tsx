import type {
  AssistantEvent,
  AssistantHost,
  AssistantRun,
} from "@faridalms/domain/assistant";
import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";
import type { EditorAssistant } from "@faridalms/editor";

import { PROVIDER_NAMES } from "@faridalms/domain/assistant";
import { contentPlainText } from "@faridalms/domain/content";
import { Button } from "@faridalms/ui/button";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useDocumentHost } from "~/components/content/document-host";
import * as m from "~/i18n/messages";
import { assistantStatusQuery } from "~/queries/assistant";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

/**
 * Sends a request to the school's language model and yields its answer as
 * it arrives, one event a line. A refusal before the answer starts throws
 * its code; aborting the signal closes the request all the way to the
 * provider.
 */
async function* runAssistant(
  request: AssistantRun,
  signal: AbortSignal,
): AsyncGenerator<AssistantEvent> {
  const response = await fetch("/assistant/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok || !response.body) {
    const refused = (await response.json().catch(() => null)) as {
      code?: string;
    } | null;
    throw new Error(refused?.code ?? response.statusText);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let held = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    held += value;
    const lines = held.split("\n");
    held = lines.pop() ?? "";
    for (const line of lines)
      if (line.trim()) yield JSON.parse(line) as AssistantEvent;
  }
  if (held.trim()) yield JSON.parse(held) as AssistantEvent;
}

/** The provider the school chose, while its teachers may use it here. */
function useAssistantStatus(on: boolean) {
  const status = useQuery({ ...assistantStatusQuery, enabled: on }).data;
  return on && status?.provider ? status.provider : null;
}

/**
 * Help from the school's language model for the document of the lesson or
 * brief this page edits, once it is saved and while the school offers it.
 */
export function useEditorAssistant(on: boolean): EditorAssistant | undefined {
  const host = useDocumentHost();
  const id = host?.id ?? null;
  const type = host?.type ?? null;
  const provider = useAssistantStatus(on && id !== null);
  return useMemo(
    () =>
      provider && id && type
        ? {
            provider: PROVIDER_NAMES[provider],
            run: (request, signal) =>
              runAssistant({ ...request, host: { type, id } }, signal),
            describe: getMessageFromError,
          }
        : undefined,
    [provider, id, type],
  );
}

export interface AssistantTranslateProps {
  /** The lesson or brief, once it is saved; the model is offered only then. */
  host: { type: AssistantHost; id: string } | null;
  original: ContentDocument;
  title: string;
  language: ContentLocale;
  /** Whether the translation already holds words of its own, which a draft replaces. */
  written: boolean;
  onTranslated: (draft: { title: string; content: ContentDocument }) => void;
}

/**
 * Drafts the other language of a document with the school's language
 * model, into the translation being written, to be checked like any
 * translation before readers have it.
 */
export function AssistantTranslate({
  host,
  original,
  title,
  language,
  written,
  onTranslated,
}: AssistantTranslateProps) {
  const provider = useAssistantStatus(host !== null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  if (!host || !provider) return null;
  const empty = contentPlainText(original).trim() === "" && !title.trim();

  const translate = async () => {
    setConfirming(false);
    const controller = new AbortController();
    request.current = controller;
    setRunning(true);
    setError(null);
    setProgress(m.assistantTranslating());
    try {
      for await (const event of runAssistant(
        { task: "translate", host, content: original, title, from: language },
        controller.signal,
      )) {
        if (event.type === "progress")
          setProgress(
            m.assistantTranslatingOf({
              done: formatNumber(event.done),
              total: formatNumber(event.total),
            }),
          );
        else if (event.type === "waiting")
          setProgress(
            m.assistantWaiting({ seconds: formatNumber(event.seconds) }),
          );
        else if (event.type === "translated") {
          onTranslated({ title: event.title, content: event.content });
          setProgress(m.assistantTranslated());
        } else if (event.type === "error")
          setError(getMessageFromError({ message: event.code }));
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(getMessageFromError(failure));
    } finally {
      request.current = null;
      setRunning(false);
    }
  };

  return (
    <div className="grid gap-2">
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.assistantTranslateHint({ provider: PROVIDER_NAMES[provider] })}
      </p>
      <div className="flex flex-wrap gap-2">
        {running ? (
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={() => {
              request.current?.abort();
              setProgress(null);
            }}
          >
            {m.assistantStop()}
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            disabled={empty}
            onClick={() => (written ? setConfirming(true) : void translate())}
          >
            <Sparkles aria-hidden />
            {m.assistantTranslate()}
          </Button>
        )}
      </div>
      <div aria-live="polite" className="text-[13px] leading-[18px]">
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : progress ? (
          <p className="text-muted-foreground">{progress}</p>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirming}
        title={m.assistantTranslateReplaceTitle()}
        body={m.assistantTranslateReplaceBody()}
        confirmLabel={m.assistantTranslate()}
        destructive={false}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void translate()}
      />
    </div>
  );
}
