import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import * as v from "valibot";

import { EventEditor } from "~/components/calendar/EventEditor";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { calendarEventQuery, calendarOptionsQuery } from "~/queries/calendar";

export const Route = createFileRoute("/_app/event-editor")({
  staticData: { breadcrumb: m.calEditorBreadcrumb, section: "/calendar" },
  validateSearch: v.object({
    id: v.optional(v.pipe(v.string(), v.uuid())),
    day: v.optional(v.pipe(v.string(), v.isoDate())),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(calendarOptionsQuery),
      ...(deps.id
        ? [context.queryClient.ensureQueryData(calendarEventQuery(deps.id))]
        : []),
    ]);
  },
  component: EditorPage,
});

function Existing({
  id,
  day,
  manages,
  onClose,
  onCreated,
}: {
  id: string;
  day: string;
  manages: boolean;
  onClose: (id?: string) => void;
  onCreated: (id: string) => void;
}) {
  const existing = useSuspenseQuery(calendarEventQuery(id)).data;
  return (
    <EventEditor
      key={existing.id}
      existing={existing}
      day={day}
      manages={manages}
      onClose={onClose}
      onCreated={onCreated}
    />
  );
}

function EditorPage() {
  const { id, day } = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const manages = user.capabilities.includes("calendar:manage");
  const [created, setCreated] = useState<string | null>(null);
  const close = (saved?: string) =>
    void (saved
      ? navigate({ to: "/calendar/$eventId", params: { eventId: saved } })
      : navigate({ to: "/calendar", search: {} }));
  // The first autosave gives a new draft its address, so a reload reopens
  // it; the editor already open stays mounted with what is being typed.
  const onCreated = (saved: string) => {
    setCreated(saved);
    void navigate({ search: { id: saved }, replace: true });
  };
  return id && id !== created ? (
    <Existing
      id={id}
      day={day ?? user.today}
      manages={manages}
      onClose={close}
      onCreated={onCreated}
    />
  ) : (
    <EventEditor
      existing={null}
      day={day ?? user.today}
      manages={manages}
      onClose={close}
      onCreated={onCreated}
    />
  );
}
