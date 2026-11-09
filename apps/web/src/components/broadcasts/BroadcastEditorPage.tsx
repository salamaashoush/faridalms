import type { QueryClient } from "@tanstack/react-query";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  announcementEditorQuery,
  announcementOptionsQuery,
} from "~/queries/announcements";
import { newsEditorQuery, newsOptionsQuery } from "~/queries/news";
import { templateQuery } from "~/queries/templates";

import type { BroadcastKind } from "./kinds";

import { BroadcastEditor } from "./BroadcastEditor";
import { KINDS } from "./kinds";

/** What a broadcast editor's route loads before it draws. */
export function loadBroadcastEditor(
  kind: BroadcastKind,
  queryClient: QueryClient,
  deps: { id?: string; template?: string },
) {
  return Promise.all([
    ...(deps.template && !deps.id
      ? [queryClient.ensureQueryData(templateQuery(deps.template))]
      : []),
    kind === "announcement"
      ? queryClient.ensureQueryData(announcementOptionsQuery)
      : queryClient.ensureQueryData(newsOptionsQuery),
    ...(deps.id
      ? [
          kind === "announcement"
            ? queryClient.ensureQueryData(announcementEditorQuery(deps.id))
            : queryClient.ensureQueryData(newsEditorQuery(deps.id)),
        ]
      : []),
  ]);
}

interface Handlers {
  kind: BroadcastKind;
  onClose: (id?: string) => void;
  onCreated: (id: string) => void;
}

function Existing({ id, ...handlers }: Handlers & { id: string }) {
  const existing = KINDS[handlers.kind].useEditor(id);
  return (
    <BroadcastEditor key={existing.id} existing={existing} {...handlers} />
  );
}

function Started({ template, ...handlers }: Handlers & { template: string }) {
  const piece = useSuspenseQuery(templateQuery(template)).data;
  return <BroadcastEditor existing={null} template={piece} {...handlers} />;
}

export interface BroadcastEditorPageProps {
  kind: BroadcastKind;
  id?: string;
  template?: string;
  onClose: (id?: string) => void;
  /** Puts a newly stored draft's id in the address. */
  onAddress: (id: string) => void;
}

/**
 * A broadcast editor at its address: a stored one by id, a new one from a
 * template, or a blank one. The first autosave gives a new draft its
 * address, so a reload reopens it, while the editor already open stays
 * mounted with what is being typed.
 */
export function BroadcastEditorPage({
  kind,
  id,
  template,
  onClose,
  onAddress,
}: BroadcastEditorPageProps) {
  const [started, setStarted] = useState<string | null>(null);
  const handlers: Handlers = {
    kind,
    onClose,
    onCreated: (saved) => {
      setStarted(saved);
      onAddress(saved);
    },
  };
  return id && id !== started ? (
    <Existing id={id} {...handlers} />
  ) : template ? (
    <Started template={template} {...handlers} />
  ) : (
    <BroadcastEditor existing={null} {...handlers} />
  );
}
