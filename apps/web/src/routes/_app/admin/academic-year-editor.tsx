import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { AcademicYearEditor } from "~/components/admin/AcademicYearEditor";
import * as m from "~/i18n/messages";
import {
  academicYearEventsQuery,
  academicYearQuery,
} from "~/queries/academic-years";
import { formatDateTime } from "~/utils/datetime";

export const Route = createFileRoute("/_app/admin/academic-year-editor")({
  staticData: { breadcrumb: m.studentSchoolYear },
  validateSearch: v.object({ id: v.optional(v.pipe(v.string(), v.uuid())) }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (deps.id)
      await Promise.all([
        context.queryClient.ensureQueryData(academicYearQuery(deps.id)),
        context.queryClient.ensureQueryData(academicYearEventsQuery(deps.id)),
      ]);
  },
  component: AcademicYearEditorPage,
});
function AcademicYearEditorPage() {
  const { id } = Route.useSearch();
  const navigate = Route.useNavigate();
  const close = () => {
    void navigate({ to: "/admin/academic-years" });
  };
  return id ? (
    <EditYear id={id} onClose={close} />
  ) : (
    <AcademicYearEditor onClose={close} />
  );
}
function EditYear({ id, onClose }: { id: string; onClose: () => void }) {
  const { data } = useSuspenseQuery(academicYearQuery(id));
  const { data: events } = useSuspenseQuery(academicYearEventsQuery(id));
  return (
    <>
      <AcademicYearEditor
        key={data.id}
        initial={{
          id: data.id,
          expectedRevision: data.revision,
          name: data.name,
          startsOn: data.startsOn,
          endsOn: data.endsOn,
          terms: data.terms.map((term) => ({
            id: term.id,
            name: term.name,
            startsOn: term.startsOn,
            endsOn: term.endsOn,
          })),
        }}
        onClose={onClose}
      />
      <YearHistory events={events} />
    </>
  );
}

const EVENT_LABEL: Record<string, () => string> = {
  activated: m.academicYearEventActivated,
  closed: m.academicYearEventClosed,
  reopened: m.academicYearEventReopened,
  made_default: m.academicYearEventMadeDefault,
  rolled_over: m.academicYearEventRolledOver,
};

function YearHistory({
  events,
}: {
  events: {
    id: string;
    action: string;
    reason: string | null;
    createdAt: Date;
    actor: { name: string };
  }[];
}) {
  return (
    <section
      aria-labelledby="year-history"
      className="mt-6 rounded-xl border bg-card p-5 sm:p-7"
    >
      <h2 id="year-history" className="font-semibold">
        {m.academicYearHistory()}
      </h2>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {m.academicYearNoHistory()}
        </p>
      ) : (
        <ol className="mt-3 divide-y">
          {events.map((event) => (
            <li key={event.id} className="py-3 text-sm">
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  {EVENT_LABEL[event.action]?.() ?? event.action}
                </span>
                <span className="text-xs text-muted-foreground">
                  {event.actor.name} ·{" "}
                  {formatDateTime(event.createdAt.toISOString())}
                </span>
              </p>
              {event.reason ? (
                <p className="mt-1 text-muted-foreground">
                  {event.action === "rolled_over"
                    ? m.academicYearRolledOverFrom({ source: event.reason })
                    : event.reason}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
