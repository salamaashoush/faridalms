import { can, PERMISSIONS, ROLES } from "@faridalms/domain/identity";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Minus, Pencil, Plus, School } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import type { DataColumn } from "~/components/admin/DataTable";

import { DataTable } from "~/components/admin/DataTable";
import { formatDay } from "~/components/admin/format";
import { PERMISSION_LABEL, ROLE_LABEL } from "~/components/admin/labels";
import {
  SchoolProfileEditor,
  SubjectEditor,
} from "~/components/admin/SchoolEditors";
import { ButtonLink } from "~/components/app/ButtonLink";
import {
  PageHeader,
  SectionCard,
  Field,
  FieldGrid,
} from "~/components/app/primitives";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import * as m from "~/i18n/messages";
import { schoolSettingsQuery, subjectsQuery } from "~/queries/school";
import { formatNumber } from "~/utils/datetime";

const searchSchema = v.object({
  section: v.optional(v.picklist(["school", "subjects", "access"]), "school"),
  q: v.optional(v.string(), ""),
  dir: v.optional(v.picklist(["asc", "desc"]), "asc"),
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
});
interface Subject {
  id: string;
  name: string;
  nameAr: string;
  slug: string;
}
const columns: DataColumn<Subject, "name">[] = [
  {
    id: "name",
    label: m.adminSubjectNameEn,
    sort: "name",
    render: (row) => <span className="font-medium">{row.name}</span>,
  },
  {
    id: "nameAr",
    label: m.adminSubjectNameAr,
    render: (row) => (
      <span lang="ar" dir="rtl">
        {row.nameAr}
      </span>
    ),
  },
  {
    id: "slug",
    label: m.settingsSubjectCode,
    render: (row) => (
      <span className="font-mono text-xs text-muted-foreground">
        {row.slug}
      </span>
    ),
  },
];
export const Route = createFileRoute("/_app/admin/settings")({
  validateSearch: searchSchema,
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(schoolSettingsQuery),
      context.queryClient.ensureQueryData(subjectsQuery),
    ]);
  },
  component: SettingsPage,
});
function SettingsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const settings = useSuspenseQuery(schoolSettingsQuery).data;
  const subjects = useSuspenseQuery(subjectsQuery).data;
  const [editing, setEditing] = useState<"school" | "subject" | Subject | null>(
    null,
  );
  const patch = (change: Partial<v.InferOutput<typeof searchSchema>>) => {
    void navigate({ search: (previous) => ({ ...previous, ...change }) });
  };
  const filtered = subjects
    .filter((row) =>
      `${row.name} ${row.nameAr} ${row.slug}`
        .toLocaleLowerCase()
        .includes(search.q.toLocaleLowerCase()),
    )
    .toSorted(
      (a, b) => a.name.localeCompare(b.name) * (search.dir === "asc" ? 1 : -1),
    );
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const page = Math.min(search.page, pages);
  return (
    <>
      <PageHeader
        title={m.adminSettingsTitle()}
        description={m.settingsSchoolHint()}
      />
      <Tabs
        value={search.section}
        onValueChange={(value) => {
          const section = (["school", "subjects", "access"] as const).find(
            (item) => item === value,
          );
          if (section) patch({ section });
        }}
      >
        <TabsList
          variant="line"
          className="mb-6 border-b"
          aria-label={m.adminSettingsTitle()}
        >
          <TabsTrigger value="school">{m.settingsSchoolName()}</TabsTrigger>
          <TabsTrigger value="subjects">{m.adminSubjectsSection()}</TabsTrigger>
          <TabsTrigger value="access">
            {m.adminPermissionsSection()}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="school">
          <div className="grid items-start gap-6 xl:grid-cols-2">
            <SectionCard
              title={settings.school.name}
              description={m.settingsSchoolHint()}
              actions={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing("school")}
                >
                  <Pencil aria-hidden />
                  {m.managementEdit()}
                </Button>
              }
            >
              <div className="mb-6 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
                <School className="size-8" aria-hidden />
              </div>
              <FieldGrid>
                <Field label={m.settingsSchoolName()}>
                  {settings.school.name}
                </Field>
                <Field label={m.settingsTimeZone()}>
                  {settings.school.timeZone}
                </Field>
              </FieldGrid>
            </SectionCard>
            <SectionCard
              title={settings.year.name}
              description={m.studentSchoolYear()}
              actions={
                <ButtonLink
                  to="/admin/academic-years"
                  variant="outline"
                  size="sm"
                >
                  {m.academicYearsManage()}
                </ButtonLink>
              }
            >
              <FieldGrid>
                <Field label={m.adminStartsOn()}>
                  {formatDay(settings.year.startsOn)}
                </Field>
                <Field label={m.adminEndsOn()}>
                  {formatDay(settings.year.endsOn)}
                </Field>
              </FieldGrid>
              <ul className="mt-6 divide-y">
                {settings.terms.map((term) => (
                  <li
                    key={term.id}
                    className="flex flex-wrap justify-between gap-2 py-4"
                  >
                    <span className="text-sm font-medium">{term.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDay(term.startsOn)} · {formatDay(term.endsOn)}
                    </span>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>
        </TabsContent>
        <TabsContent value="subjects">
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setEditing("subject")}>
              <Plus aria-hidden />
              {m.settingsAddSubject()}
            </Button>
          </div>
          <DataTable
            columns={columns}
            rows={filtered.slice((page - 1) * 25, page * 25)}
            caption={m.adminSubjectsCaption()}
            query={search.q}
            onQuery={(q) => patch({ q, page: 1 })}
            sort="name"
            direction={search.dir}
            onSort={() => patch({ dir: search.dir === "asc" ? "desc" : "asc" })}
            page={page}
            pages={pages}
            total={filtered.length}
            onPage={(next) => patch({ page: next })}
            renderActions={(row) => (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditing(row)}
                aria-label={m.managementEditNamed({ name: row.name })}
              >
                <Pencil aria-hidden />
                {m.managementEdit()}
              </Button>
            )}
          />
        </TabsContent>
        <TabsContent value="access">
          <SectionCard
            title={m.adminPermissionsSection()}
            description={m.adminPermissionsCaption()}
          >
            <PermissionMatrix />
          </SectionCard>
        </TabsContent>
      </Tabs>
      {editing === "school" ? (
        <SchoolProfileEditor
          initial={settings.school}
          onClose={() => setEditing(null)}
        />
      ) : editing ? (
        <SubjectEditor
          initial={editing === "subject" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function PermissionMatrix() {
  return (
    <>
      <div className="flex flex-col gap-4 md:hidden">
        {ROLES.map((role) => {
          const held = PERMISSIONS.filter((permission) =>
            can(role, permission),
          );
          return (
            <div key={role} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{ROLE_LABEL[role]()}</h3>
                <span className="text-xs text-muted-foreground">
                  {m.adminPermissionsHeldBy({
                    count: formatNumber(held.length),
                  })}
                </span>
              </div>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {held.map((permission) => (
                  <li key={permission}>
                    <Badge variant="secondary">
                      {PERMISSION_LABEL[permission]()}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="hidden md:block">
        <Table>
          <TableCaption>{m.adminPermissionsCaption()}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{m.adminCapability()}</TableHead>
              {ROLES.map((role) => (
                <TableHead key={role} className="text-center">
                  {ROLE_LABEL[role]()}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERMISSIONS.map((permission) => (
              <TableRow key={permission}>
                <TableCell className="font-medium">
                  {PERMISSION_LABEL[permission]()}
                </TableCell>
                {ROLES.map((role) => (
                  <TableCell key={role} className="text-center">
                    {can(role, permission) ? (
                      <>
                        <Check
                          className="mx-auto size-4 text-[var(--success)]"
                          aria-hidden
                        />
                        <span className="sr-only">
                          {m.adminPermissionGranted()}
                        </span>
                      </>
                    ) : (
                      <>
                        <Minus
                          className="mx-auto size-4 text-muted-foreground/50"
                          aria-hidden
                        />
                        <span className="sr-only">
                          {m.adminPermissionWithheld()}
                        </span>
                      </>
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
