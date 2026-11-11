import type { QueryClient } from "@tanstack/react-query";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import {
  announcementEditorQuery,
  announcementOptionsQuery,
} from "~/queries/announcements";
import { templateQuery } from "~/queries/templates";

import { AnnouncementEditor } from "./AnnouncementEditor";

/** What the announcement editor's route loads before it draws. */
export function loadAnnouncementEditor(
  queryClient: QueryClient,
  deps: { id?: string; template?: string },
) {
  return Promise.all([
    ...(deps.template && !deps.id
      ? [queryClient.ensureQueryData(templateQuery(deps.template))]
      : []),
    queryClient.ensureQueryData(announcementOptionsQuery),
    ...(deps.id
      ? [queryClient.ensureQueryData(announcementEditorQuery(deps.id))]
      : []),
  ]);
}

interface Handlers {
  onClose: (id?: string) => void;
  onCreated: (id: string) => void;
}

function Existing({ id, ...handlers }: Handlers & { id: string }) {
  const existing = useSuspenseQuery(announcementEditorQuery(id)).data;
  return (
    <AnnouncementEditor key={existing.id} existing={existing} {...handlers} />
  );
}

function Started({ template, ...handlers }: Handlers & { template: string }) {
  const piece = useSuspenseQuery(templateQuery(template)).data;
  return <AnnouncementEditor existing={null} template={piece} {...handlers} />;
}

export interface AnnouncementEditorPageProps {
  id?: string;
  template?: string;
  onClose: (id?: string) => void;
  /** Puts a newly stored draft's id in the address. */
  onAddress: (id: string) => void;
}

/**
 * The announcement editor at its address: a stored one by id, a new one
 * from a template, or a blank one. The first autosave gives a new draft its
 * address, so a reload reopens it, while the editor already open stays
 * mounted with what is being typed.
 */
export function AnnouncementEditorPage({
  id,
  template,
  onClose,
  onAddress,
}: AnnouncementEditorPageProps) {
  const [started, setStarted] = useState<string | null>(null);
  const handlers: Handlers = {
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
    <AnnouncementEditor existing={null} {...handlers} />
  );
}
