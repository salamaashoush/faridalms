import { Checkbox } from "@faridalms/ui/checkbox";
import { Input } from "@faridalms/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@faridalms/ui/select";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Search } from "lucide-react";
import { useState } from "react";

import * as m from "~/i18n/messages";

import { StudioField } from "./controls";

/** A class the builder may list, with whether the school shows it on the website. */
export interface ClassChoice {
  id: string;
  label: string;
  shown: boolean;
}

export interface ClassPickerProps {
  id: string;
  label: string;
  hint?: string;
  value: string[];
  max: number;
  classes: ClassChoice[];
  onChange: (value: string[]) => void;
}

/**
 * The classes a courses section lists, found by name. Only a class the
 * school shows on the website can be picked; each leads to its record,
 * where its public words are written.
 */
export function ClassPicker({
  id,
  label,
  hint,
  value,
  max,
  classes,
  onChange,
}: ClassPickerProps) {
  const [query, setQuery] = useState("");
  const chosen = new Set<string>(value);
  const found = classes.filter((row) =>
    row.label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const toggle = (classId: string, on: boolean) =>
    onChange(
      on
        ? [...value, classId].slice(0, max)
        : value.filter((each) => each !== classId),
    );
  return (
    <StudioField id={id} label={label} hint={hint}>
      <div className="grid gap-2">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={id}
            type="search"
            value={query}
            placeholder={m.siteClassSearch()}
            aria-label={m.siteClassSearch()}
            className="ps-8 max-md:h-10"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        {classes.length === 0 ? (
          <EmptyState placement="section" title={m.siteClassNoneToPick()} />
        ) : (
          <ul className="grid max-h-72 gap-1 overflow-y-auto rounded-md border p-1">
            {found.map((row) => {
              const box = `${id}-${row.id}`;
              return (
                <li
                  key={row.id}
                  className="flex min-h-10 items-center gap-2 rounded px-2 hover:bg-muted"
                >
                  <Checkbox
                    id={box}
                    checked={chosen.has(row.id)}
                    disabled={!row.shown && !chosen.has(row.id)}
                    onCheckedChange={(on) => toggle(row.id, on)}
                  />
                  <label htmlFor={box} className="grid min-w-0 flex-1 text-sm">
                    <span className="truncate">{row.label}</span>
                    {row.shown ? null : (
                      <span className="text-[12px] text-muted-foreground">
                        {m.siteClassNotShown()}
                      </span>
                    )}
                  </label>
                  <Link
                    to="/classes/$classId"
                    params={{ classId: row.id }}
                    target="_blank"
                    className="inline-flex size-8 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    aria-label={m.siteClassOpenRecord({ title: row.label })}
                  >
                    <ExternalLink aria-hidden className="size-4" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </StudioField>
  );
}

export interface CoursePickerProps {
  id: string;
  label: string;
  value: string;
  courses: { id: string; label: string }[];
  onChange: (value: string) => void;
}

/** The course whose shown classes a section lists. */
export function CoursePicker({
  id,
  label,
  value,
  courses,
  onChange,
}: CoursePickerProps) {
  const shown =
    courses.find((course) => course.id === value)?.label ??
    m.siteClassChooseCourse();
  return (
    <StudioField id={id} label={label}>
      <Select value={value} onValueChange={(next) => onChange(next ?? "")}>
        <SelectTrigger id={id} className="w-full max-md:h-10">
          <SelectValue>{shown}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {courses.map((course) => (
            <SelectItem key={course.id} value={course.id}>
              {course.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </StudioField>
  );
}
