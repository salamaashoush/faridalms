import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
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
}: {
  id: string;
  day: string;
  manages: boolean;
  onClose: (id?: string) => void;
}) {
  const existing = useSuspenseQuery(calendarEventQuery(id)).data;
  return (
    <EventEditor
      key={existing.version}
      existing={existing}
      day={day}
      manages={manages}
      onClose={onClose}
    />
  );
}

function EditorPage() {
  const { id, day } = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const manages = user.capabilities.includes("calendar:manage");
  const close = (saved?: string) =>
    void (saved
      ? navigate({ to: "/calendar/$eventId", params: { eventId: saved } })
      : navigate({ to: "/calendar", search: {} }));
  return id ? (
    <Existing
      id={id}
      day={day ?? user.today}
      manages={manages}
      onClose={close}
    />
  ) : (
    <EventEditor
      existing={null}
      day={day ?? user.today}
      manages={manages}
      onClose={close}
    />
  );
}
