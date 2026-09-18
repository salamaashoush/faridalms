import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import * as v from "valibot";

import { DataTable } from "~/components/admin/DataTable";
import { PersonAvatar } from "~/components/admin/PersonAvatar";
import { ButtonLink } from "~/components/app/ButtonLink";
import {
  PageHeader,
  SectionCard,
  Field,
  FieldGrid,
} from "~/components/app/primitives";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import * as m from "~/i18n/messages";
import { classQuery } from "~/queries/school";

export const Route = createFileRoute("/_app/classes/$classId")({
  validateSearch: v.object({
    tab: v.optional(v.picklist(["overview", "students"]), "overview"),
    q: v.optional(v.string(), ""),
    page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    dir: v.optional(v.picklist(["asc", "desc"]), "asc"),
  }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(classQuery(params.classId)),
  component: ClassPage,
});
function ClassPage() {
  const { classId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data } = useSuspenseQuery(classQuery(classId));
  const patch = (change: Partial<typeof search>) => {
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  };
  const rows = data.roster
    .filter((row) =>
      `${row.firstName} ${row.lastName} ${row.reference}`
        .toLocaleLowerCase()
        .includes(search.q.toLocaleLowerCase()),
    )
    .toSorted(
      (a, b) =>
        `${a.firstName} ${a.lastName}`.localeCompare(
          `${b.firstName} ${b.lastName}`,
        ) * (search.dir === "asc" ? 1 : -1),
    );
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const page = Math.min(search.page, pages);
  return (
    <>
      <PageHeader
        title={data.name}
        description={data.schoolYear ?? undefined}
        actions={
          data.canManage ? (
            <ButtonLink to="/admin/class-editor" search={{ id: data.id }}>
              <Pencil aria-hidden />
              {m.managementEditClass()}
            </ButtonLink>
          ) : undefined
        }
      />
      <Tabs
        value={search.tab}
        onValueChange={(tab) => {
          if (tab === "overview" || tab === "students") patch({ tab });
        }}
        className="gap-6"
      >
        <TabsList>
          <TabsTrigger value="overview">{m.recordOverview()}</TabsTrigger>
          <TabsTrigger value="students">{m.adminStudentsTitle()}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
            <SectionCard title={m.classDetailsTitle()}>
              <FieldGrid>
                <Field label={m.studentGrade()}>{data.grade}</Field>
                <Field label={m.adminRoom()}>{data.room}</Field>
                <Field label={m.adminHomeroom()}>
                  {data.homeroomTeacher?.name}
                </Field>
                <Field label={m.studentSchoolYear()}>{data.schoolYear}</Field>
              </FieldGrid>
            </SectionCard>
            <SectionCard title={m.adminSubjectsTaught()}>
              <ul className="divide-y">
                {data.subjects.map((link) =>
                  link.subject ? (
                    <li
                      key={link.subject.id}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <span className="font-medium">{link.subject.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {link.teacher?.name ?? m.commonNotRecorded()}
                      </span>
                    </li>
                  ) : null,
                )}
              </ul>
            </SectionCard>
          </div>
        </TabsContent>
        <TabsContent value="students">
          <DataTable
            rows={rows.slice((page - 1) * 25, page * 25)}
            columns={[
              {
                id: "name",
                label: m.adminName,
                sort: "name",
                render: (row) => (
                  <Link
                    to="/students/$studentId"
                    params={{ studentId: row.id }}
                    search={{}}
                    className="flex items-center gap-3 font-medium hover:text-primary hover:underline"
                  >
                    <PersonAvatar
                      name={`${row.firstName} ${row.lastName}`}
                      photoUrl={row.photoUrl}
                    />
                    {row.firstName} {row.lastName}
                  </Link>
                ),
              },
              {
                id: "reference",
                label: m.adminReference,
                render: (row) => row.reference,
              },
            ]}
            caption={m.adminStudentsTitle()}
            query={search.q}
            onQuery={(q) => patch({ q, page: 1 })}
            sort="name"
            direction={search.dir}
            onSort={() => patch({ dir: search.dir === "asc" ? "desc" : "asc" })}
            page={page}
            pages={pages}
            total={rows.length}
            onPage={(nextPage) => patch({ page: nextPage })}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
