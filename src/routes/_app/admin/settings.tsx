import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Lock, Minus } from "lucide-react";

import { formatDay } from "~/components/admin/format";
import { PERMISSION_LABEL, ROLE_LABEL } from "~/components/admin/labels";
import { SubjectIcon } from "~/components/app/labels";
import {
  EmptyState,
  Field,
  FieldGrid,
  PageHeader,
  SectionCard,
} from "~/components/app/primitives";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { can, PERMISSIONS, ROLES } from "~/data/identity";
import * as m from "~/i18n/messages";
import { schoolSettingsQuery, subjectsQuery } from "~/queries/school";
import { formatNumber } from "~/utils/datetime";

export const Route = createFileRoute("/_app/admin/settings")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(schoolSettingsQuery),
      context.queryClient.ensureQueryData(subjectsQuery),
    ]);
  },
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const settings = useSuspenseQuery(schoolSettingsQuery).data;
  const subjects = useSuspenseQuery(subjectsQuery).data;

  return (
    <>
      <PageHeader
        title={m.adminSettingsTitle()}
        description={m.adminSettingsSubtitle()}
        actions={<Badge variant="outline">{m.adminReadOnlyBadge()}</Badge>}
      />

      <Alert className="mb-6">
        <Lock aria-hidden />
        <AlertTitle>{m.adminReadOnlyBadge()}</AlertTitle>
        <AlertDescription>{m.adminReadOnlyNotice()}</AlertDescription>
      </Alert>

      <div className="flex flex-col gap-6">
        <SectionCard title={m.adminSchoolYearSection()}>
          <FieldGrid>
            <Field label={m.adminName()}>{settings.year.name}</Field>
            <Field label={m.adminStartsOn()}>
              {formatDay(settings.year.startsOn)}
            </Field>
            <Field label={m.adminEndsOn()}>
              {formatDay(settings.year.endsOn)}
            </Field>
          </FieldGrid>
        </SectionCard>

        <SectionCard
          title={m.adminTermsSection()}
          description={m.adminTermsCount({
            count: formatNumber(settings.terms.length),
          })}
        >
          {settings.terms.length === 0 ? (
            <EmptyState title={m.adminTermsEmpty()} />
          ) : (
            <>
              <ul className="flex flex-col gap-3 sm:hidden">
                {settings.terms.map((term) => (
                  <li
                    key={term.id}
                    className="rounded-lg border border-border p-3"
                  >
                    <p className="text-sm font-semibold">{term.name}</p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs text-muted-foreground">
                          {m.adminStartsOn()}
                        </dt>
                        <dd>{formatDay(term.startsOn)}</dd>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs text-muted-foreground">
                          {m.adminEndsOn()}
                        </dt>
                        <dd>{formatDay(term.endsOn)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>

              <div className="hidden sm:block">
                <Table>
                  <TableCaption>{m.adminTermsCaption()}</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{m.gradesTerm()}</TableHead>
                      <TableHead>{m.adminStartsOn()}</TableHead>
                      <TableHead>{m.adminEndsOn()}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settings.terms.map((term) => (
                      <TableRow key={term.id}>
                        <TableCell className="font-medium">
                          {term.name}
                        </TableCell>
                        <TableCell>{formatDay(term.startsOn)}</TableCell>
                        <TableCell>{formatDay(term.endsOn)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </SectionCard>

        <SectionCard
          title={m.adminSubjectsSection()}
          description={m.adminSubjectsCount({
            count: formatNumber(subjects.length),
          })}
        >
          {subjects.length === 0 ? (
            <EmptyState title={m.adminSubjectsEmpty()} />
          ) : (
            <>
              <ul className="flex flex-col gap-2 sm:hidden">
                {subjects.map((subject) => (
                  <li
                    key={subject.id}
                    className="flex items-center gap-3 rounded-lg border border-border p-3"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                      <SubjectIcon icon={subject.icon} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {subject.name}
                      </p>
                      <p
                        className="truncate text-xs text-muted-foreground"
                        lang="ar"
                        dir="rtl"
                      >
                        {subject.nameAr}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="hidden sm:block">
                <Table>
                  <TableCaption>{m.adminSubjectsCaption()}</TableCaption>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{m.adminSubjectNameEn()}</TableHead>
                      <TableHead>{m.adminSubjectNameAr()}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subjects.map((subject) => (
                      <TableRow key={subject.id}>
                        <TableCell>
                          <span className="flex items-center gap-2.5 font-medium">
                            <SubjectIcon icon={subject.icon} />
                            {subject.name}
                          </span>
                        </TableCell>
                        <TableCell lang="ar" dir="rtl">
                          {subject.nameAr}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </SectionCard>

        <SectionCard
          title={m.adminPermissionsSection()}
          description={m.adminPermissionsCaption()}
        >
          <PermissionMatrix />
        </SectionCard>
      </div>
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
