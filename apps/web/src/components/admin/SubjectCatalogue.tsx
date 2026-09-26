import type { SaveSubjectInput } from "@faridalms/domain/administration-schema";
import type { ReactNode } from "react";

import { saveSubjectSchema } from "@faridalms/domain/administration-schema";
import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { BookOpen, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type {
  Column,
  DataTableSort,
  RowAction,
} from "~/components/system/DataTable";
import type { IndexToolbarProps } from "~/components/system/IndexPage";

import { DataTable } from "~/components/system/DataTable";
import { TextField } from "~/components/system/field";
import { SheetForm } from "~/components/system/SheetForm";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { saveSubject } from "~/server/school";
import { getMessageFromError } from "~/utils/error";

export interface Subject {
  id: string;
  name: string;
  nameAr: string;
  slug: string;
}

export type SubjectSort = "name" | "code";

export const SUBJECT_PAGE_SIZE = 25;

/** The name in the reader's language leads; the other one follows it. */
function names(subject: Subject) {
  return getLocale() === "ar"
    ? { own: subject.nameAr, other: subject.name, otherLang: "en" }
    : { own: subject.name, other: subject.nameAr, otherLang: "ar" };
}

export function filterSubjects(
  subjects: Subject[],
  query: string,
  sort: SubjectSort,
  direction: "asc" | "desc",
) {
  const wanted = query.trim().toLocaleLowerCase();
  const collator = new Intl.Collator(getLocale());
  const key = (subject: Subject) =>
    sort === "code" ? subject.slug : names(subject).own;
  return subjects
    .filter((subject) =>
      `${subject.name} ${subject.nameAr} ${subject.slug}`
        .toLocaleLowerCase()
        .includes(wanted),
    )
    .toSorted(
      (a, b) =>
        collator.compare(key(a), key(b)) * (direction === "asc" ? 1 : -1),
    );
}

function Code({ value }: { value: string }) {
  return (
    <span
      dir="ltr"
      className="font-mono text-[13px] leading-[18px] text-muted-foreground"
    >
      {value}
    </span>
  );
}

type NameLink = (subject: Subject, name: string) => ReactNode;

function OtherName({ subject }: { subject: Subject }) {
  const { other, otherLang } = names(subject);
  return (
    <span lang={otherLang} dir="auto">
      {other}
    </span>
  );
}

function subjectColumns(nameLink: NameLink): Column<Subject, SubjectSort>[] {
  const ar = getLocale() === "ar";
  return [
    {
      id: "name",
      header: ar ? m.adminSubjectNameAr() : m.adminSubjectNameEn(),
      sort: "name",
      primary: true,
      cell: (row) => nameLink(row, names(row).own),
    },
    {
      id: "other",
      header: ar ? m.adminSubjectNameEn() : m.adminSubjectNameAr(),
      cell: (row) => <OtherName subject={row} />,
    },
    {
      id: "code",
      header: m.settingsSubjectCode(),
      sort: "code",
      cell: (row) => <Code value={row.slug} />,
    },
  ];
}

function subjectCard(nameLink: NameLink) {
  return {
    title: (row: Subject) => nameLink(row, names(row).own),
    fact: (row: Subject) => (
      <>
        <Code value={row.slug} />
        {" · "}
        <OtherName subject={row} />
      </>
    ),
  };
}

export function SubjectCatalogue({
  rows,
  total,
  page,
  toolbar,
  sort,
  onPage,
  nameLink,
  onAdd,
  onEdit,
}: {
  rows: Subject[];
  total: number;
  page: number;
  toolbar: IndexToolbarProps;
  sort: DataTableSort<SubjectSort>;
  onPage: (page: number) => void;
  nameLink: NameLink;
  onAdd: () => void;
  onEdit: (subject: Subject) => void;
}) {
  const rowActions = (row: Subject): RowAction[] => [
    {
      label: m.settingsEditSubject(),
      icon: Pencil,
      onSelect: () => onEdit(row),
    },
  ];
  return (
    <DataTable
      caption={m.adminSubjectsCaption()}
      rows={rows}
      columns={subjectColumns(nameLink)}
      rowLabel={(row) => names(row).own}
      toolbar={toolbar}
      sort={sort}
      rowActions={rowActions}
      pagination={{
        page,
        pages: Math.max(1, Math.ceil(total / SUBJECT_PAGE_SIZE)),
        total,
        pageSize: SUBJECT_PAGE_SIZE,
        onPage,
      }}
      card={subjectCard(nameLink)}
      empty={{
        icon: BookOpen,
        title: m.settingsSubjectsEmptyTitle(),
        description: m.settingsSubjectHint(),
        action: (
          <Button type="button" className="max-md:h-10" onClick={onAdd}>
            <Plus aria-hidden />
            {m.settingsAddSubject()}
          </Button>
        ),
      }}
    />
  );
}

const EMPTY: SaveSubjectInput = { slug: "", name: "", nameAr: "" };

export function SubjectSheet({
  open,
  subject,
  onClose,
}: {
  open: boolean;
  subject?: Subject;
  onClose: () => void;
}) {
  // A code another subject already uses stays marked on the field until the
  // person changes it.
  const [refused, setRefused] = useState<{
    value: string;
    message: string;
  } | null>(null);
  const mutation = useMutation({
    mutationFn: (data: SaveSubjectInput) => saveSubject({ data }),
    meta: { inlineError: true },
  });
  const form = useForm({
    defaultValues: subject ?? EMPTY,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: saveSubjectSchema },
    onSubmit: async ({ value }) => {
      setRefused(null);
      try {
        await mutation.mutateAsync(value);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "management.subject_code_conflict"
        )
          setRefused({
            value: value.slug.trim(),
            message: getMessageFromError(error),
          });
        return;
      }
      toast.success(m.managementSaved());
      onClose();
    },
  });
  const failure =
    mutation.error && !refused ? getMessageFromError(mutation.error) : null;
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={subject ? m.settingsEditSubject() : m.settingsAddSubject()}
      onSubmit={() => form.handleSubmit()}
      pending={mutation.isPending}
      error={failure}
    >
      <form.Field name="name">
        {(field) => (
          <TextField
            id="subject-name"
            label={m.adminSubjectNameEn()}
            width="name"
            lang="en"
            autoComplete="off"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
          />
        )}
      </form.Field>
      <form.Field name="nameAr">
        {(field) => (
          <TextField
            id="subject-name-ar"
            label={m.adminSubjectNameAr()}
            width="name"
            lang="ar"
            dir="rtl"
            autoComplete="off"
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            errors={field.state.meta.errors}
          />
        )}
      </form.Field>
      <form.Field name="slug">
        {(field) => (
          <TextField
            id="subject-code"
            label={m.settingsSubjectCode()}
            hint={m.settingsSubjectCodeHint()}
            width="code"
            dir="ltr"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            errors={
              refused && refused.value === field.state.value.trim()
                ? [refused.message]
                : field.state.meta.errors
            }
          />
        )}
      </form.Field>
    </SheetForm>
  );
}
