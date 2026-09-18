import type { PersonProfile as Profile } from "@faridalms/database/repositories/people";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";

import { ROLE_LABEL } from "~/components/admin/labels";
import { PersonAvatar } from "~/components/admin/PersonAvatar";
import { ButtonLink } from "~/components/app/ButtonLink";
import { SubjectIcon } from "~/components/app/labels";
import {
  Field,
  PageHeader,
  SectionCard,
  Value,
} from "~/components/app/primitives";
import { subjectLabel } from "~/components/family/format";
import { Badge } from "~/components/ui/badge";
import * as m from "~/i18n/messages";
import { personQuery } from "~/queries/people";

import { RELATION_LABEL } from "./relations";

export function PersonProfile({ userId }: { userId: string }) {
  const { profile, access } = useSuspenseQuery(personQuery(userId)).data;
  return (
    <>
      <PageHeader
        title={profile.name}
        description={profile.title ?? ROLE_LABEL[profile.role]()}
        actions={
          access.self ? (
            <ButtonLink to="/notification-preferences" variant="outline">
              <Bell aria-hidden />
              {m.notifPreferences()}
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <PersonAvatar name={profile.name} photoUrl={profile.avatarUrl} />
        <Badge variant="secondary">{ROLE_LABEL[profile.role]()}</Badge>
        {profile.isActive ? null : (
          <Badge variant="outline" className="text-muted-foreground">
            {m.adminInactive()}
          </Badge>
        )}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.5fr]">
        {profile.contact ? (
          <SectionCard title={m.personContact()}>
            <dl className="grid gap-5">
              <Field label={m.adminEmail()}>
                <a
                  className="break-all text-primary hover:underline"
                  href={`mailto:${profile.contact.email}`}
                >
                  {profile.contact.email}
                </a>
              </Field>
              <Field label={m.familyMobile()}>
                {profile.contact.mobile ? (
                  <a
                    className="text-primary hover:underline"
                    href={`tel:${profile.contact.mobile}`}
                    dir="ltr"
                  >
                    {profile.contact.mobile}
                  </a>
                ) : null}
              </Field>
              <Field label={m.adminJobTitle()}>{profile.title}</Field>
            </dl>
          </SectionCard>
        ) : null}
        <div className="flex flex-col gap-6">
          {profile.role === "teacher" || profile.teaching.length > 0 ? (
            <Teaching rows={profile.teaching} />
          ) : null}
          {profile.role === "parent" ? (
            <Children rows={profile.children} />
          ) : null}
          {profile.student ? (
            <SectionCard title={m.personStudentRecord()}>
              <Link
                to="/students/$studentId"
                params={{ studentId: profile.student.id }}
                search={{}}
                className="flex flex-wrap items-center gap-3 font-medium hover:text-primary hover:underline"
              >
                <PersonAvatar
                  name={profile.student.fullName}
                  photoUrl={profile.student.photoUrl}
                />
                {profile.student.fullName}
                <span className="text-sm font-normal text-muted-foreground">
                  <Value>{profile.student.className}</Value>
                </span>
              </Link>
            </SectionCard>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Teaching({ rows }: { rows: Profile["teaching"] }) {
  return (
    <SectionCard title={m.personTeaching()}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.personNoTeaching()}</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li
              key={`${row.classId}:${row.subject?.id ?? "homeroom"}`}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              {row.canOpen ? (
                <Link
                  to="/classes/$classId"
                  params={{ classId: row.classId }}
                  search={{}}
                  className="font-medium hover:text-primary hover:underline"
                >
                  {row.className}
                </Link>
              ) : (
                <span className="font-medium">{row.className}</span>
              )}
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                {row.subject ? (
                  <>
                    <SubjectIcon icon={row.subject.icon} />
                    {subjectLabel(row.subject)}
                  </>
                ) : (
                  m.personHomeroom()
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function Children({ rows }: { rows: Profile["children"] }) {
  return (
    <SectionCard title={m.navChildren()}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.personNoChildren()}</p>
      ) : (
        <ul className="divide-y">
          {rows.map((child) => (
            <li
              key={child.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <Link
                to="/students/$studentId"
                params={{ studentId: child.id }}
                search={{}}
                className="flex items-center gap-3 font-medium hover:text-primary hover:underline"
              >
                <PersonAvatar name={child.fullName} photoUrl={child.photoUrl} />
                {child.fullName}
              </Link>
              <span className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <Value>{child.className}</Value>
                <span aria-hidden>·</span>
                {RELATION_LABEL[child.relation]()}
                {child.isPrimary ? (
                  <Badge variant="outline">{m.recordPrimaryContact()}</Badge>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
