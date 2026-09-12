import type { ReactNode } from "react";

import { useSuspenseQuery } from "@tanstack/react-query";

import { Value } from "~/components/app/primitives";
import { StudentSwitcher } from "~/components/app/StudentSwitcher";
import { initialsOf } from "~/components/app/UserMenu";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import * as m from "~/i18n/messages";
import { visibleStudentsQuery } from "~/queries/school";

/**
 * Whose page this is, plus the control for changing it.
 *
 * The switcher hides itself for a single-child family, so the name is stated
 * separately: a page of grades with no child named on it is the ambiguity the
 * old portal shipped.
 */
export function StudentScopeBar({
  studentId,
  onChange,
  children,
}: {
  studentId: string;
  onChange: (id: string) => void;
  children?: ReactNode;
}) {
  const students = useSuspenseQuery(visibleStudentsQuery).data;
  const active =
    students.find((student) => student.id === studentId) ?? students[0] ?? null;

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-card px-4 py-3 shadow-xs ring-1 ring-foreground/10">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-10 shrink-0">
          {active?.photoUrl ? (
            <AvatarImage
              src={active.photoUrl}
              alt={m.familyPhotoAlt({ name: active.fullName })}
            />
          ) : null}
          <AvatarFallback className="text-xs font-semibold">
            {active ? initialsOf(active.fullName) : null}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            <Value>{active?.fullName}</Value>
          </p>
          <p className="truncate text-xs text-muted-foreground">
            <Value>{active?.className ?? active?.grade}</Value>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {children}
        <StudentSwitcher value={studentId} onChange={onChange} />
      </div>
    </div>
  );
}
