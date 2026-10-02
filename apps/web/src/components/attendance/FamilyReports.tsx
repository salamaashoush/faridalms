import type {
  AbsenceReportKind,
  AbsenceReportStatus,
} from "@faridalms/domain/attendance";
import type { FileSummary } from "@faridalms/domain/file";

import { ABSENCE_REPORT_KINDS } from "@faridalms/domain/attendance";
import { Button } from "@faridalms/ui/button";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarPlus, Paperclip, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Tone } from "~/components/system/status";

import { ConfirmDialog } from "~/components/system/ConfirmDialog";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { FileField } from "~/components/system/FileField";
import {
  RecordEmpty,
  RecordList,
  RecordSection,
} from "~/components/system/RecordPage";
import { SheetForm } from "~/components/system/SheetForm";
import { StatusText } from "~/components/system/status";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { myAbsenceReportsQuery } from "~/queries/attendance";
import { reportAbsence, withdrawAbsenceReport } from "~/server/attendance";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof myAbsenceReportsQuery>["queryFn"]>>
>;
type Report = Data["reports"][number];

const NOTE_BYTES = 10 * 1024 * 1024;

export const DECISION_LABEL: Record<AbsenceReportStatus, () => string> = {
  pending: m.repPending,
  accepted: m.repAccepted,
  declined: m.repDeclined,
  withdrawn: m.repWithdrawn,
};

export const DECISION_TONE: Record<AbsenceReportStatus, Tone> = {
  pending: "warning",
  accepted: "success",
  declined: "danger",
  withdrawn: "neutral",
};

const KIND_LABEL: Record<AbsenceReportKind, () => string> = {
  absent: m.repKindAbsent,
  late: m.repKindLate,
  early: m.repKindEarly,
};

/** What a report says happens, and when: "Away · 5 Oct – 7 Oct". */
export function reportWhat(report: {
  kind: AbsenceReportKind;
  from: string;
  to: string;
  at: string | null;
}) {
  const days =
    report.from === report.to
      ? formatDate(report.from)
      : m.coverDays({
          from: formatDate(report.from),
          to: formatDate(report.to),
        });
  if (report.kind === "late")
    return m.repLateAt({ time: report.at ?? "", day: days });
  if (report.kind === "early")
    return m.repEarlyAt({ time: report.at ?? "", day: days });
  return m.repAway({ days });
}

export function reasonOf(report: {
  reasonEn: string | null;
  reasonAr: string | null;
}) {
  return inLocale(report.reasonEn, report.reasonAr);
}

function ReportRow({
  report,
  onWithdraw,
}: {
  report: Report;
  onWithdraw: (report: Report) => void;
}) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-3">
      <div className="grid min-w-0 gap-0.5">
        <span className="text-sm leading-5 font-medium">
          {reportWhat(report)}
        </span>
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {reasonOf(report)}
          {report.note ? " · " : null}
          {report.note ? <bdi>{report.note}</bdi> : null}
        </span>
        {report.fileId ? (
          <a
            href={`/files/${report.fileId}`}
            target="_blank"
            rel="noreferrer"
            className="flex w-fit items-center gap-1 text-[13px] leading-[18px] text-primary underline-offset-4 hover:underline"
          >
            <Paperclip className="size-3.5" aria-hidden />
            <bdi>{report.fileName ?? m.repFileOpen()}</bdi>
          </a>
        ) : null}
        {report.decisionNote ? (
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {m.repSchoolSaid()} <bdi>{report.decisionNote}</bdi>
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <StatusText tone={DECISION_TONE[report.decision]}>
          {DECISION_LABEL[report.decision]()}
        </StatusText>
        {report.decision === "pending" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="max-md:h-10"
            onClick={() => onWithdraw(report)}
          >
            <Undo2 aria-hidden />
            {m.repWithdraw()}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * What a family has told the school about a child's absences, and the way
 * to tell it more: a day away, a late arrival, an early leave, or leave
 * asked ahead, each answered by the office.
 */
export function FamilyReports({
  studentId,
  name,
}: {
  studentId: string;
  name: string;
}) {
  const data = useSuspenseQuery(myAbsenceReportsQuery(studentId)).data;
  const queryClient = useQueryClient();
  const withdraw = useServerFn(withdrawAbsenceReport);
  const [adding, setAdding] = useState(false);
  const [leaving, setLeaving] = useState<Report | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["attendance", "reports"] });
  const takeBack = useMutation({
    mutationFn: (report: Report) => withdraw({ data: { id: report.id } }),
    onSuccess: async () => {
      setLeaving(null);
      await refresh();
    },
  });
  return (
    <RecordSection
      title={m.repTitle()}
      description={m.repHint()}
      action={
        <Button
          type="button"
          variant="outline"
          className="max-md:h-10"
          onClick={() => setAdding(true)}
        >
          <CalendarPlus aria-hidden />
          {m.repAdd()}
        </Button>
      }
    >
      {data.reports.length === 0 ? (
        <RecordEmpty>{m.repNone()}</RecordEmpty>
      ) : (
        <RecordList>
          {data.reports.map((report) => (
            <ReportRow
              key={report.id}
              report={report}
              onWithdraw={setLeaving}
            />
          ))}
        </RecordList>
      )}
      <ReportSheet
        key={adding ? `open-${studentId}` : "closed"}
        open={adding}
        studentId={studentId}
        data={data}
        onClose={() => setAdding(false)}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={leaving !== null}
        title={m.repWithdrawTitle()}
        body={m.repWithdrawBody({ name })}
        confirmLabel={m.repWithdraw()}
        pending={takeBack.isPending}
        error={takeBack.error ? getMessageFromError(takeBack.error) : undefined}
        onConfirm={() => {
          if (leaving) takeBack.mutate(leaving);
        }}
        onCancel={() => setLeaving(null)}
      />
    </RecordSection>
  );
}

function ReportSheet({
  open,
  studentId,
  data,
  onClose,
  onSaved,
}: {
  open: boolean;
  studentId: string;
  data: Data;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const send = useServerFn(reportAbsence);
  const [kind, setKind] = useState<AbsenceReportKind>("absent");
  const [from, setFrom] = useState(data.today);
  const [to, setTo] = useState(data.today);
  const [at, setAt] = useState("");
  const [reasonId, setReasonId] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [checked, setChecked] = useState(false);
  const away = kind === "absent";
  const save = useMutation({
    mutationFn: () =>
      send({
        data: {
          studentId,
          kind,
          from,
          to: away ? to : from,
          at: away ? "" : at,
          reasonId,
          note,
          fileId: files[0]?.id ?? "",
        },
      }),
    onSuccess: async () => {
      toast.success(m.repSent());
      await onSaved();
      onClose();
    },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={m.repAdd()}
      submitLabel={m.repSend()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={() => {
        setChecked(true);
        if (!reasonId || (!away && !at)) return;
        save.mutate();
      }}
    >
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm leading-5 font-medium">
          {m.repKind()}
        </legend>
        <RadioGroup
          value={kind}
          onValueChange={(value: string) => setKind(value as AbsenceReportKind)}
          className="gap-1"
        >
          {ABSENCE_REPORT_KINDS.map((value) => (
            <label
              key={value}
              htmlFor={`report-${value}`}
              className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60"
            >
              <RadioGroupItem id={`report-${value}`} value={value} />
              <span className="text-sm leading-5">{KIND_LABEL[value]()}</span>
            </label>
          ))}
        </RadioGroup>
      </fieldset>
      <div className="flex flex-wrap gap-4">
        <TextField
          id="report-from"
          type="date"
          label={away ? m.repFrom() : m.repDay()}
          width="date"
          min={data.earliest}
          value={from}
          onChange={(event) => {
            setFrom(event.target.value);
            if (event.target.value > to) setTo(event.target.value);
          }}
        />
        {away ? (
          <TextField
            id="report-to"
            type="date"
            label={m.repTo()}
            width="date"
            min={from}
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
        ) : (
          <TextField
            id="report-at"
            type="time"
            label={kind === "late" ? m.repArrives() : m.repLeaves()}
            width="code"
            value={at}
            onChange={(event) => setAt(event.target.value)}
            errors={checked && !at ? [m.repChooseTime()] : undefined}
          />
        )}
      </div>
      <SelectField
        id="report-reason"
        label={m.repReason()}
        value={reasonId}
        options={data.reasons.map((row) => ({
          value: row.id,
          label: inLocale(row.labelEn, row.labelAr) || row.code,
        }))}
        onChange={setReasonId}
        errors={checked && !reasonId ? [m.repChooseReason()] : undefined}
      />
      <FormField id="report-note" label={m.repNote()} optional>
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </FormField>
      <FileField
        id="report-file"
        label={m.repFile()}
        hint={m.repFileHint()}
        purpose="evidence"
        value={files}
        onChange={(update) => setFiles(update)}
        maxFiles={1}
        maxBytes={NOTE_BYTES}
        optional
      />
    </SheetForm>
  );
}
