import type { ContactOutcome } from "@faridalms/domain/attendance";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";

import { CONTACT_OUTCOMES } from "@faridalms/domain/attendance";
import { Button } from "@faridalms/ui/button";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import { ButtonLink } from "@faridalms/ui/system/button-link";
import { DataTable, RowLink } from "@faridalms/ui/system/data-table";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { FormField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import { Value } from "@faridalms/ui/system/value";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarX2, CircleCheck, PhoneCall, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { classTitle } from "~/components/classes/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { followUpQuery } from "~/queries/attendance";
import { logAttendanceContact } from "~/server/attendance";
import { formatDate, formatInstant, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { DayNav } from "./DayNav";
import { formatRate } from "./format";

type FollowUpData = NonNullable<
  Awaited<
    ReturnType<NonNullable<ReturnType<typeof followUpQuery>["queryFn"]>>
  >["followUp"]
>;
type Call = FollowUpData["calls"][number];
type Overdue = FollowUpData["overdue"]["rows"][number] & { id: string };
type Support = FollowUpData["support"]["rows"][number] & { id: string };

const OUTCOME_LABEL: Record<ContactOutcome, () => string> = {
  reached: m.fupReached,
  no_answer: m.fupNoAnswer,
  left_message: m.fupLeftMessage,
  messaged: m.fupMessaged,
};

const nameOf = (row: {
  fullNameEn: string | null;
  fullNameAr: string | null;
}) => inLocale(row.fullNameEn, row.fullNameAr);

interface StudentLinkProps {
  row: {
    studentId: string;
    fullNameEn: string | null;
    fullNameAr: string | null;
  };
}

function StudentLink({ row }: StudentLinkProps) {
  return (
    <RowLink
      to="/students/$studentId"
      params={{ studentId: row.studentId }}
      search={{ tab: "attendance" }}
    >
      {nameOf(row)}
    </RowLink>
  );
}

const studentCell = (row: Overdue | Support) => <StudentLink row={row} />;

const supportTag = (row: Support) => (
  <StatusText tone={row.severe ? "danger" : "warning"}>
    {row.severe ? m.fupSevere() : m.fupPersistent()}
  </StatusText>
);

// Built per render: headers read the request's locale, which a module-level
// array would fix at whichever language first loaded the module on the server.
function overdueColumns(): Column<Overdue>[] {
  return [
    { id: "student", header: m.attStudent(), primary: true, cell: studentCell },
    {
      id: "marks",
      header: m.fupUnexplained(),
      cell: (row) => formatNumber(row.marks),
    },
    {
      id: "oldest",
      header: m.fupSince(),
      cell: (row) => formatDate(row.oldest),
    },
  ];
}

function supportColumns(): Column<Support>[] {
  return [
    { id: "student", header: m.attStudent(), primary: true, cell: studentCell },
    {
      id: "class",
      header: m.attClass(),
      cell: (row) =>
        classTitle({
          code: "",
          titleEn: row.classTitleEn,
          titleAr: row.classTitleAr,
        }),
    },
    {
      id: "rate",
      header: m.attendanceRate(),
      cell: (row) => formatRate(row.rate),
    },
    {
      id: "missed",
      header: m.fupMissed(),
      cell: (row) =>
        m.fupMissedOf({
          missed: formatNumber(row.missed),
          sessions: formatNumber(row.sessions),
        }),
    },
    { id: "level", header: m.attStatus(), cell: supportTag },
  ];
}

interface CallRowProps {
  call: Call;
  onLog: (call: Call) => void;
}

function CallRow({ call, onLog }: CallRowProps) {
  const reached = call.contacts.some((row) => row.outcome === "reached");
  return (
    <li className="grid gap-3 py-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] md:items-start">
      <div className="grid gap-0.5">
        <StudentLink row={call} />
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {[
            call.homeroomCode
              ? classTitle({
                  code: call.homeroomCode,
                  titleEn: call.homeroomTitleEn,
                  titleAr: call.homeroomTitleAr,
                })
              : null,
            m.fupAwayFrom({
              period: inLocale(call.periodNameEn, call.periodNameAr),
            }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <div className="grid gap-2">
        {call.guardians.length === 0 ? (
          <EmptyState placement="section" title={m.fupNoContacts()} />
        ) : (
          <ul className="grid gap-1">
            {call.guardians.map((guardian) => (
              <li
                key={guardian.userId}
                className="flex flex-wrap items-baseline gap-x-2 text-sm leading-5"
              >
                <bdi className="font-medium">{nameOf(guardian)}</bdi>
                <span className="text-[13px] text-muted-foreground">
                  {[
                    inLocale(guardian.relationEn, guardian.relationAr),
                    guardian.emergency ? m.fupEmergency() : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {guardian.phone ? (
                  <a
                    href={`tel:${guardian.phone}`}
                    dir="ltr"
                    className="text-primary tabular-nums underline-offset-4 hover:underline"
                  >
                    {guardian.phone}
                  </a>
                ) : (
                  <span className="text-[13px]">
                    <Value absent={m.fupNoPhone()} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {call.contacts.length > 0 ? (
          <ul className="grid gap-0.5">
            {call.contacts.map((contact) => (
              <li
                key={contact.id}
                className="text-[13px] leading-[18px] text-muted-foreground"
              >
                {m.fupLogged({
                  outcome: OUTCOME_LABEL[contact.outcome](),
                  time: formatInstant(contact.at, "time"),
                  name: inLocale(contact.byNameEn, contact.byNameAr),
                })}
                {contact.note ? (
                  <>
                    {" · "}
                    <bdi>{contact.note}</bdi>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {reached ? (
          <StatusText tone="success">{m.fupReached()}</StatusText>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          onClick={() => onLog(call)}
        >
          <PhoneCall aria-hidden />
          {m.fupLog()}
        </Button>
        <ButtonLink
          to="/attendance"
          search={{ tab: "absences", show: "unexplained", q: nameOf(call) }}
          variant="ghost"
          className="max-md:h-10"
        >
          {m.fupGiveReason()}
        </ButtonLink>
      </div>
    </li>
  );
}

export interface FollowUpProps {
  date: string;
  onDate: (date: string) => void;
}

/**
 * What the office follows up: today's calls about absences nobody
 * explained, reasons now overdue, and the children missing enough of the
 * year to need support.
 */
export function FollowUp({ date, onDate }: FollowUpProps) {
  const [overduePage, setOverduePage] = useState(1);
  const [supportPage, setSupportPage] = useState(1);
  // Another day's lists start again at their first pages.
  const [shownDate, setShownDate] = useState(date);
  if (date !== shownDate) {
    setShownDate(date);
    setOverduePage(1);
    setSupportPage(1);
  }
  const data = useSuspenseQuery(
    followUpQuery({ date, overduePage, supportPage }),
  ).data.followUp;
  const navigate = useNavigate();
  const [logging, setLogging] = useState<Call | null>(null);
  if (!data) return <EmptyState icon={CalendarX2} title={m.attNoYear()} />;
  const giveReason = (row: Overdue): RowAction[] => [
    {
      label: m.fupGiveReason(),
      inline: true,
      onSelect: () =>
        navigate({
          to: "/attendance",
          search: {
            tab: "absences",
            show: "unexplained",
            q: nameOf(row),
            from: row.oldest,
          },
        }),
    },
  ];
  return (
    <div className="grid gap-8">
      <DayNav
        id="follow-up-date"
        date={data.date}
        min={data.year.startsOn}
        max={data.today}
        today={data.today}
        onChange={onDate}
      />
      <section aria-labelledby="follow-calls" className="grid gap-3">
        <div className="grid gap-1">
          <h2 id="follow-calls" className="text-base leading-6 font-semibold">
            {data.date === data.today
              ? m.fupCalls()
              : m.fupCallsOn({ date: formatDate(data.date) })}
          </h2>
          <p className="text-sm leading-5 text-muted-foreground">
            {m.fupCallsHint()}
          </p>
        </div>
        {data.calls.length === 0 ? (
          <EmptyState placement="section" kind="done" title={m.fupNoCalls()} />
        ) : (
          <ul className="divide-y rounded-lg border bg-card px-4">
            {data.calls.map((call) => (
              <CallRow key={call.studentId} call={call} onLog={setLogging} />
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="follow-overdue" className="grid gap-3">
        <div className="grid gap-1">
          <h2 id="follow-overdue" className="text-base leading-6 font-semibold">
            {m.fupOverdue()}
          </h2>
          <p className="text-sm leading-5 text-muted-foreground">
            {m.fupOverdueHint({ date: formatDate(data.dueBefore) })}
          </p>
        </div>
        <DataTable
          caption={m.fupOverdue()}
          rows={data.overdue.rows.map((row) => ({
            ...row,
            id: row.studentId,
          }))}
          columns={overdueColumns()}
          rowLabel={nameOf}
          rowActions={giveReason}
          card={{
            title: studentCell,
            fact: (row: Overdue) =>
              m.fupOverdueFact({
                count: row.marks,
                date: formatDate(row.oldest),
              }),
          }}
          pagination={
            data.overdue.pages > 1
              ? {
                  page: data.overdue.page,
                  pages: data.overdue.pages,
                  total: data.overdue.total,
                  pageSize: data.overdue.pageSize,
                  onPage: setOverduePage,
                }
              : undefined
          }
          empty={{ icon: CircleCheck, title: m.fupNoOverdue() }}
        />
      </section>
      <section aria-labelledby="follow-support" className="grid gap-3">
        <div className="grid gap-1">
          <h2 id="follow-support" className="text-base leading-6 font-semibold">
            {m.fupSupport()}
          </h2>
          <p className="text-sm leading-5 text-muted-foreground">
            {m.fupSupportHint({ percent: formatNumber(data.chronicPercent) })}
          </p>
        </div>
        <DataTable
          caption={m.fupSupport()}
          rows={data.support.rows.map((row) => ({
            ...row,
            id: row.studentId,
          }))}
          columns={supportColumns()}
          rowLabel={nameOf}
          card={{
            title: studentCell,
            status: supportTag,
            fact: (row: Support) =>
              `${formatRate(row.rate)} · ${m.fupMissedOf({
                missed: formatNumber(row.missed),
                sessions: formatNumber(row.sessions),
              })}`,
          }}
          pagination={
            data.support.pages > 1
              ? {
                  page: data.support.page,
                  pages: data.support.pages,
                  total: data.support.total,
                  pageSize: data.support.pageSize,
                  onPage: setSupportPage,
                }
              : undefined
          }
          empty={{ icon: ShieldAlert, title: m.fupNoSupport() }}
        />
      </section>
      {logging ? (
        <ContactSheet
          call={logging}
          date={data.date}
          onClose={() => setLogging(null)}
        />
      ) : null}
    </div>
  );
}

interface ContactSheetProps {
  call: Call;
  date: string;
  onClose: () => void;
}

function ContactSheet({ call, date, onClose }: ContactSheetProps) {
  const queryClient = useQueryClient();
  const log = useServerFn(logAttendanceContact);
  const [outcome, setOutcome] = useState<ContactOutcome>("reached");
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () =>
      log({ data: { studentId: call.studentId, date, outcome, note } }),
    onSuccess: async () => {
      toast.success(m.fupLoggedToast());
      await queryClient.invalidateQueries({
        queryKey: ["attendance", "follow-up"],
      });
      onClose();
    },
  });
  return (
    <SheetForm
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={m.fupLogFor({ name: nameOf(call) })}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={() => save.mutate()}
    >
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm leading-5 font-medium">
          {m.fupOutcome()}
        </legend>
        <RadioGroup
          value={outcome}
          onValueChange={(value: string) => setOutcome(value as ContactOutcome)}
          className="gap-1"
        >
          {CONTACT_OUTCOMES.map((value) => (
            <label
              key={value}
              htmlFor={`contact-${value}`}
              className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
            >
              <RadioGroupItem id={`contact-${value}`} value={value} />
              <span className="text-sm leading-5">
                {OUTCOME_LABEL[value]()}
              </span>
            </label>
          ))}
        </RadioGroup>
      </fieldset>
      <FormField
        id="contact-note"
        label={m.fupNote()}
        hint={m.fupNoteHint()}
        optional
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}
