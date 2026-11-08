import type { Column } from "@faridalms/ui/system/data-table";

import { ButtonLink } from "@faridalms/ui/system/button-link";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { useQuery } from "@tanstack/react-query";
import { MessagesSquare, Plus } from "lucide-react";

import * as m from "~/i18n/messages";
import { moduleDiscussionsQuery } from "~/queries/coursework";
import { formatInstant } from "~/utils/datetime";

import { classTitle } from "../classes/format";

type Row = NonNullable<
  Awaited<
    ReturnType<
      NonNullable<ReturnType<typeof moduleDiscussionsQuery>["queryFn"]>
    >
  >
>[number];

const dueOf = (row: Row) =>
  row.dueAt ? formatInstant(row.dueAt) : m.courseworkNoDueDate();

const columns = (): Column<Row>[] => [
  {
    id: "title",
    header: m.discussionColumn(),
    primary: true,
    cell: (row) => (
      <RowLink
        to="/assignments/$assignmentId"
        params={{ assignmentId: row.id }}
        search={{}}
      >
        {row.title}
      </RowLink>
    ),
  },
  {
    id: "class",
    header: m.lrnClass(),
    cell: (row) => (row.class ? classTitle(row.class) : null),
  },
  { id: "due", header: m.courseworkDue(), cell: dueOf },
];

export interface ModuleDiscussionsProps {
  moduleId: string;
  /** The class a new discussion is set for first; the teacher may choose another. */
  classId: string;
}

/**
 * The discussions a module holds, one a class, for whoever teaches it: each
 * opens as the work it is, marked and moderated there.
 */
export function ModuleDiscussions({
  moduleId,
  classId,
}: ModuleDiscussionsProps) {
  const rows = useQuery(moduleDiscussionsQuery(moduleId)).data;
  const add = (
    <ButtonLink
      to="/assignment-editor"
      search={{ moduleId, ...(classId ? { classId } : {}) }}
      className="max-md:h-10"
    >
      <Plus aria-hidden />
      {m.discussionNewInModule()}
    </ButtonLink>
  );
  if (!rows) return <div aria-busy="true" className="min-h-40" />;
  return (
    <DataTable
      caption={m.discussionModuleCaption()}
      rows={rows}
      columns={columns()}
      rowLabel={(row) => row.title}
      card={{
        title: (row) => row.title,
        fact: (row) =>
          [row.class ? classTitle(row.class) : null, dueOf(row)]
            .filter(Boolean)
            .join(" · "),
      }}
      actions={add}
      empty={{
        icon: MessagesSquare,
        title: m.discussionModuleEmpty(),
        description: m.discussionModuleEmptyBody(),
        action: add,
      }}
    />
  );
}
