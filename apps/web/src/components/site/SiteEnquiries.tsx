import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Check, Inbox, Mail, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import type { Column, RowAction } from "~/components/system/DataTable";

import { formatInstant } from "~/components/coursework/format";
import { DataTable } from "~/components/system/DataTable";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { siteEnquiriesQuery } from "~/queries/site";
import { markSiteEnquiry } from "~/server/site";
import { getMessageFromError } from "~/utils/error";

import { CHOICE_LABEL } from "./studio/labels";

type Row = Awaited<
  ReturnType<NonNullable<ReturnType<typeof siteEnquiriesQuery>["queryFn"]>>
>["rows"][number];

function Sender({ row }: { row: Row }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <span dir="auto" className="truncate font-medium">
        {row.name}
      </span>
      <a
        href={`mailto:${row.email}`}
        dir="ltr"
        className="truncate text-[13px] text-primary hover:underline"
      >
        {row.email}
      </a>
      {row.phone ? (
        <span dir="ltr" className="text-[13px] text-muted-foreground">
          {row.phone}
        </span>
      ) : null}
    </div>
  );
}

function About({ row }: { row: Row }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <span className="text-sm font-medium">
        {CHOICE_LABEL.purpose?.[row.purpose]?.()}
      </span>
      {row.childYear ? (
        <span className="text-[13px] text-muted-foreground">
          {row.childYear}
        </span>
      ) : null}
      {row.message ? (
        <p
          dir="auto"
          className="line-clamp-3 text-[13px] leading-[18px] whitespace-pre-line text-muted-foreground"
        >
          {row.message}
        </p>
      ) : null}
    </div>
  );
}

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function enquiryColumns(timeZone: string): Column<Row>[] {
  return [
    {
      id: "from",
      header: m.siteEnquiryFrom(),
      primary: true,
      cell: (row) => <Sender row={row} />,
    },
    {
      id: "about",
      header: m.siteEnquiryAbout(),
      cell: (row) => <About row={row} />,
    },
    {
      id: "received",
      header: m.siteEnquiryReceived(),
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {formatInstant(row.createdAt, timeZone)}
        </span>
      ),
    },
  ];
}

const enquiryCard = {
  title: (row: Row) => <Sender row={row} />,
  status: (row: Row) => <About row={row} />,
};

/** Messages families sent from the website's forms, open until someone deals with them. */
export function SiteEnquiries({
  handled,
  onHandled,
}: {
  handled: boolean;
  onHandled: (handled: boolean) => void;
}) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const rows = useSuspenseQuery(siteEnquiriesQuery(handled)).data.rows;
  const mark = async (row: Row, next: boolean) => {
    try {
      await markSiteEnquiry({
        data: { id: row.id, expectedVersion: row.version, handled: next },
      });
      await queryClient.invalidateQueries({ queryKey: ["site", "enquiries"] });
      toast.success(m.siteEnquiryMarked());
    } catch (error) {
      toast.error(getMessageFromError(error));
    }
  };
  const columns = enquiryColumns(user.school.timeZone);
  const rowActions = (row: Row): RowAction[] => [
    {
      label: m.siteEnquiryReply(),
      icon: Mail,
      onSelect: () => {
        window.location.href = `mailto:${row.email}`;
      },
    },
    handled
      ? {
          label: m.siteEnquiryReopen(),
          icon: RotateCcw,
          inline: true,
          onSelect: () => mark(row, false),
        }
      : {
          label: m.siteEnquiryMarkHandled(),
          icon: Check,
          inline: true,
          onSelect: () => mark(row, true),
        },
  ];
  return (
    <div className="grid gap-4">
      <fieldset className="flex gap-1 justify-self-start rounded-lg bg-muted p-1">
        <legend className="sr-only">{m.siteTabEnquiries()}</legend>
        {[false, true].map((value) => (
          <button
            key={String(value)}
            type="button"
            aria-pressed={handled === value}
            onClick={() => onHandled(value)}
            className="min-h-8 rounded-md px-3 text-sm font-medium text-muted-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm max-md:min-h-10"
          >
            {value ? m.siteEnquiriesHandled() : m.siteEnquiriesOpen()}
          </button>
        ))}
      </fieldset>
      <DataTable
        caption={m.siteEnquiriesCaption()}
        rows={rows}
        columns={columns}
        rowLabel={(row) => row.name}
        rowActions={rowActions}
        card={enquiryCard}
        empty={{
          icon: Inbox,
          title: m.siteEnquiriesEmpty(),
          description: m.siteEnquiriesEmptyBody(),
        }}
      />
    </div>
  );
}
