import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import * as v from "valibot";

import { TimetableEditor } from "~/components/admin/TimetableEditor";
import * as m from "~/i18n/messages";
import { classTimetableQuery } from "~/queries/timetable";

export const Route = createFileRoute("/_app/admin/timetable-editor")({
  staticData: { breadcrumb: m.timetableTitle },
  validateSearch: v.object({ classId: v.pipe(v.string(), v.uuid()) }),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await context.queryClient.ensureQueryData(
      classTimetableQuery(deps.classId),
    );
  },
  component: TimetableEditorPage,
});

function TimetableEditorPage() {
  const { classId } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(classTimetableQuery(classId));
  return (
    <TimetableEditor
      key={`${data.id}:${data.revision}`}
      className={data.name}
      offerings={data.classSubjects.flatMap((row) =>
        row.subject ? [{ subject: row.subject, teacher: row.teacher }] : [],
      )}
      initial={{
        classId: data.id,
        expectedRevision: data.revision,
        slots: data.timetableSlots.flatMap((slot) =>
          slot.weekday >= 0 && slot.weekday <= 4
            ? [
                {
                  weekday: slot.weekday as 0 | 1 | 2 | 3 | 4,
                  startTime: slot.startTime.slice(0, 5),
                  endTime: slot.endTime.slice(0, 5),
                  subjectId: slot.subjectId,
                  teacherId: slot.teacherId ?? "",
                  room: slot.room ?? "",
                },
              ]
            : [],
        ),
      }}
      onClose={() => {
        void navigate({
          to: "/classes/$classId",
          params: { classId },
          search: {},
        });
      }}
    />
  );
}
