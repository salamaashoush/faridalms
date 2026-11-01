import { useSuspenseQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";

import type { Column } from "~/components/system/DataTable";

import { DataTable, RowLink } from "~/components/system/DataTable";
import { StatusText } from "~/components/system/status";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { consentFormsQuery } from "~/queries/consents";
import { formatInstant, formatNumber } from "~/utils/datetime";

type Data = Awaited<
  ReturnType<NonNullable<(typeof consentFormsQuery)["queryFn"]>>
>;
type Row = Data["purposes"][number];

const labelOf = (row: Row) => inLocale(row.labelEn, row.labelAr) || row.code;

function Purpose({ row }: { row: Row }) {
  return (
    <RowLink to="/consent-form-editor" search={{ purpose: row.id }}>
      {labelOf(row)}
    </RowLink>
  );
}

function FormState({ row }: { row: Row }) {
  if (!row.published)
    return (
      <StatusText tone={row.draftId ? "info" : "warning"}>
        {row.draftId ? m.consentFormsDraft() : m.consentFormsNotWritten()}
      </StatusText>
    );
  return (
    <span className="grid gap-0.5">
      <span>
        {m.consentFormsVersion({
          version: row.published.versionLabel,
          date: row.published.publishedAt
            ? formatInstant(row.published.publishedAt, "date")
            : "",
        })}
      </span>
      {row.draftId ? (
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {m.consentFormsDraftOpen()}
        </span>
      ) : null}
    </span>
  );
}

function answers(row: Row, students: number) {
  if (!row.published) return "–";
  return m.consentFormsAnswers({
    granted: formatNumber(row.granted),
    refused: formatNumber(row.refused),
    waiting: formatNumber(Math.max(0, students - row.granted - row.refused)),
  });
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function columns(students: number): Column<Row>[] {
  return [
    {
      id: "purpose",
      header: m.consentFormsPurpose(),
      primary: true,
      cell: (row) => <Purpose row={row} />,
    },
    {
      id: "form",
      header: m.consentFormsForm(),
      cell: (row) => <FormState row={row} />,
    },
    {
      id: "answers",
      header: m.consentFormsAnswersHeader(),
      cell: (row) => answers(row, students),
    },
  ];
}

function cardOf(students: number) {
  return {
    title: (row: Row) => <Purpose row={row} />,
    status: (row: Row) => <FormState row={row} />,
    fact: (row: Row) => answers(row, students),
  };
}

/** The purposes a school asks families to agree to, each with its form and the answers so far. */
export function ConsentForms() {
  const data = useSuspenseQuery(consentFormsQuery).data;
  return (
    <DataTable
      caption={m.consentFormsCaption()}
      rows={data.purposes}
      columns={columns(data.students)}
      rowLabel={labelOf}
      card={cardOf(data.students)}
      empty={{
        icon: ShieldCheck,
        title: m.consentFormsEmpty(),
        description: m.consentFormsEmptyBody(),
      }}
    />
  );
}
