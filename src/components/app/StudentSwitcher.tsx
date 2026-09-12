import { useSuspenseQuery } from "@tanstack/react-query";
import { useId } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import * as m from "~/i18n/messages";
import { visibleStudentsQuery } from "~/queries/school";
import { cn } from "~/utils/cn";

import { initialsOf } from "./UserMenu";

/**
 * Which child the page is about.
 *
 * The selection lives in the URL, not in component state, so a link to one
 * child's attendance opens that child's attendance.
 *
 * Built from real radio inputs rather than buttons carrying `role="radio"`, so
 * arrow-key navigation and form semantics come from the platform.
 */
export function StudentSwitcher({
  value,
  onChange,
}: {
  value: string;
  onChange: (studentId: string) => void;
}) {
  const students = useSuspenseQuery(visibleStudentsQuery).data;
  const groupName = useId();

  // One child is not a choice; showing a picker for it is noise.
  if (students.length < 2) {
    return null;
  }

  const active = value || students[0]?.id;

  return (
    <fieldset className="flex flex-wrap items-center gap-2 border-0 p-0">
      <legend className="sr-only">{m.commonSelectStudent()}</legend>
      {students.map((student) => {
        const selected = student.id === active;
        return (
          <label
            key={student.id}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-full border py-1.5 ps-1.5 pe-4 text-sm font-medium transition-colors",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <input
              type="radio"
              name={groupName}
              value={student.id}
              checked={selected}
              onChange={() => onChange(student.id)}
              className="sr-only"
            />
            <Avatar className="size-7">
              {student.photoUrl ? (
                <AvatarImage src={student.photoUrl} alt="" />
              ) : null}
              <AvatarFallback
                className={cn(
                  "text-[0.65rem] font-semibold",
                  selected
                    ? "bg-primary-foreground/20 text-primary-foreground"
                    : "bg-muted",
                )}
              >
                {initialsOf(student.fullName)}
              </AvatarFallback>
            </Avatar>
            <span className="flex flex-col items-start leading-tight">
              <span>{student.firstName}</span>
              <span
                className={cn(
                  "text-[0.7rem]",
                  selected
                    ? "text-primary-foreground/75"
                    : "text-muted-foreground",
                )}
              >
                {student.className ?? student.grade}
              </span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
