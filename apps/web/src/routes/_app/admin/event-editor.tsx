import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { EventEditor } from "~/components/calendar/EventEditor";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { calendarEventQuery, calendarOptionsQuery } from "~/queries/calendar";

export const Route = createFileRoute("/_app/admin/event-editor")({
  staticData: { breadcrumb: m.calEditorBreadcrumb, section: "/calendar" },
  validateSearch: v.object({ id: v.optional(v.pipe(v.string(), v.uuid())) }),
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
  onClose,
}: {
  id: string;
  day: string;
  onClose: (id?: string) => void;
}) {
  const existing = useSuspenseQuery(calendarEventQuery(id)).data;
  return (
    <EventEditor
      key={existing.version}
      existing={existing}
      day={day}
      onClose={onClose}
    />
  );
}

function EditorPage() {
  const { id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const user = useCurrentUser();
  const close = (saved?: string) =>
    void (saved
      ? navigate({ to: "/calendar/$eventId", params: { eventId: saved } })
      : navigate({ to: "/calendar", search: {} }));
  return id ? (
    <Existing id={id} day={user.today} onClose={close} />
  ) : (
    <EventEditor existing={null} day={user.today} onClose={close} />
  );
}
