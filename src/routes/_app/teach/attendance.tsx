import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { School, Users } from "lucide-react";
import * as v from "valibot";

import { EmptyState, PageHeader } from "~/components/app/primitives";
import { ClassPicker } from "~/components/teach/ClassPicker";
import { RegisterForm } from "~/components/teach/RegisterForm";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import * as m from "~/i18n/messages";
import { attendanceRegisterQuery, myClassesQuery } from "~/queries/school";
import { attendanceRegisterQuerySchema } from "~/schema/school";

export const Route = createFileRoute("/_app/teach/attendance")({
  validateSearch: (search) => v.parse(attendanceRegisterQuerySchema, search),
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(attendanceRegisterQuery(deps)),
      context.queryClient.ensureQueryData(myClassesQuery),
    ]);
  },
  component: AttendanceRegisterPage,
});

function AttendanceRegisterPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const register = useSuspenseQuery(attendanceRegisterQuery(search)).data;
  const classes = useSuspenseQuery(myClassesQuery).data;

  return (
    <>
      <PageHeader
        title={m.attendanceRecord()}
        description={m.teachAttendanceSubtitle()}
      />

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
        <ClassPicker
          id="register-class"
          label={m.commonSelectClass()}
          value={register.classId ?? ""}
          classes={classes}
          onChange={(classId) => {
            void navigate({ search: (previous) => ({ ...previous, classId }) });
          }}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="register-date">{m.attendanceDate()}</Label>
          <Input
            id="register-date"
            type="date"
            className="h-11 w-full sm:h-9 sm:w-48"
            value={register.date}
            onChange={(event) => {
              void navigate({
                search: (previous) => ({
                  ...previous,
                  date: event.target.value,
                }),
              });
            }}
          />
        </div>
      </div>

      {register.classId === null ? (
        <EmptyState icon={School} title={m.teachNoClasses()} />
      ) : register.roster.length === 0 ? (
        <EmptyState icon={Users} title={m.teachRosterEmpty()} />
      ) : (
        <RegisterForm
          key={`${register.classId}|${register.date}`}
          classId={register.classId}
          date={register.date}
          roster={register.roster}
          marks={register.marks}
        />
      )}
    </>
  );
}
