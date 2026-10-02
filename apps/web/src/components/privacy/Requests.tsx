import type {
  RequestKind,
  RequestLaw,
  RequestOutcome,
  RequestRelation,
} from "@faridalms/domain/privacy";

import { hasClock } from "@faridalms/domain/privacy";
import { Button } from "@faridalms/ui/button";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, CircleCheck, FileText, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Column, RowAction } from "~/components/system/DataTable";
import type { Tone } from "~/components/system/status";

import { displayName } from "~/components/people/format";
import { ComboboxField } from "~/components/system/ComboboxField";
import { DataTable } from "~/components/system/DataTable";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { Fact, Facts } from "~/components/system/RecordPage";
import { SheetForm } from "~/components/system/SheetForm";
import { StatusText } from "~/components/system/status";
import { UserText } from "~/components/system/UserText";
import * as m from "~/i18n/messages";
import { closeRequest, extendRequest, saveRequest } from "~/server/privacy";
import { searchPeople } from "~/server/students";
import { formatDate, formatRelativeDays } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { PrivacyOverview } from "./DataProtection";

import { PersonName } from "./DataProtection";

export type RequestRow = PrivacyOverview["requests"][number];

export const KIND_LABEL: Record<RequestKind, () => string> = {
  access: m.privacyKindAccess,
  correction: m.privacyKindCorrection,
  erasure: m.privacyKindErasure,
  objection: m.privacyKindObjection,
};

export const LAW_LABEL: Record<RequestLaw, () => string> = {
  uk_gdpr: m.privacyLawUk,
  england_record: m.privacyLawEnglandRecord,
  ferpa: m.privacyLawFerpa,
  egypt: m.privacyLawEgypt,
  other: m.privacyLawOther,
};

const LAW_CLOCK: Record<RequestLaw, () => string> = {
  uk_gdpr: m.privacyClockUk,
  england_record: m.privacyClockEnglandRecord,
  ferpa: m.privacyClockFerpa,
  egypt: m.privacyClockEgypt,
  other: m.privacyClockOther,
};

const RELATION_LABEL: Record<RequestRelation, () => string> = {
  self: m.privacyRelationSelf,
  parent: m.privacyRelationParent,
  representative: m.privacyRelationRepresentative,
  authority: m.privacyRelationAuthority,
};

const OUTCOME_LABEL: Record<RequestOutcome, () => string> = {
  completed: m.privacyOutcomeCompleted,
  refused: m.privacyOutcomeRefused,
  withdrawn: m.privacyOutcomeWithdrawn,
};

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["privacy"] });
}

const deadline = (row: RequestRow) => row.extendedTo ?? row.dueOn;

function standing(
  row: RequestRow,
  today: string,
): { tone: Tone; label: string } {
  if (row.outcome)
    return {
      tone: row.outcome === "completed" ? "success" : "neutral",
      label: OUTCOME_LABEL[row.outcome](),
    };
  const due = deadline(row);
  if (due < today) return { tone: "danger", label: m.privacyOverdue() };
  return {
    tone: "warning",
    label: m.privacyDueIn({ when: formatRelativeDays(due, Date.parse(today)) }),
  };
}

function RequestStatus({ row, today }: { row: RequestRow; today: string }) {
  const { tone, label } = standing(row, today);
  return <StatusText tone={tone}>{label}</StatusText>;
}

function requestColumns(today: string): Column<RequestRow>[] {
  return [
    {
      id: "name",
      header: m.privacyPerson(),
      primary: true,
      cell: (row) => (
        <span className="grid gap-0.5">
          <PersonName row={row} />
          <UserText
            text={m.privacyAskedBy({
              name: row.requestedBy,
              relation: RELATION_LABEL[row.relation](),
            })}
            className="text-[13px] leading-[18px] text-muted-foreground"
          />
        </span>
      ),
    },
    {
      id: "kind",
      header: m.privacyRequestKind(),
      cell: (row) => KIND_LABEL[row.kind](),
    },
    {
      id: "received",
      header: m.privacyReceived(),
      cell: (row) => formatDate(row.receivedOn),
    },
    {
      id: "due",
      header: m.privacyDueBy(),
      cell: (row) => formatDate(deadline(row)),
    },
    {
      id: "status",
      header: m.privacyStatus(),
      cell: (row) => <RequestStatus row={row} today={today} />,
    },
  ];
}

function requestCard(today: string) {
  return {
    title: (row: RequestRow) => <PersonName row={row} />,
    status: (row: RequestRow) => <RequestStatus row={row} today={today} />,
    fact: (row: RequestRow) => KIND_LABEL[row.kind](),
  };
}

export function RequestsTable({
  overview,
  onAdd,
  onEdit,
  onExtend,
  onClose,
}: {
  overview: PrivacyOverview;
  onAdd: () => void;
  onEdit: (row: RequestRow) => void;
  onExtend: (row: RequestRow) => void;
  onClose: (row: RequestRow) => void;
}) {
  const rowActions = (row: RequestRow): RowAction[] =>
    row.outcome
      ? []
      : [
          {
            label: m.privacyCloseRequest(),
            icon: CircleCheck,
            onSelect: () => onClose(row),
          },
          ...(row.law === "uk_gdpr" && !row.extendedTo
            ? [
                {
                  label: m.privacyExtendRequest(),
                  icon: CalendarPlus,
                  onSelect: () => onExtend(row),
                },
              ]
            : []),
          {
            label: m.privacyEditRequest(),
            icon: Pencil,
            onSelect: () => onEdit(row),
          },
        ];
  return (
    <DataTable
      caption={m.privacyRequestsCaption()}
      rows={overview.requests}
      columns={requestColumns(overview.today)}
      rowLabel={displayName}
      rowActions={rowActions}
      card={requestCard(overview.today)}
      empty={{
        icon: FileText,
        title: m.privacyNoRequests(),
        description: m.privacyNoRequestsHint(),
        action: (
          <Button type="button" className="max-md:h-10" onClick={onAdd}>
            <FileText aria-hidden />
            {m.privacyLogRequest()}
          </Button>
        ),
      }}
    />
  );
}

export function RequestSheet({
  open,
  request,
  today,
  onClose,
}: {
  open: boolean;
  request: RequestRow | null;
  today: string;
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const [search, setSearch] = useState("");
  const [subjectId, setSubjectId] = useState(request?.subjectUserId ?? "");
  const [requestedBy, setRequestedBy] = useState(request?.requestedBy ?? "");
  const [relation, setRelation] = useState<RequestRelation>(
    request?.relation ?? "self",
  );
  const [kind, setKind] = useState<RequestKind>(request?.kind ?? "access");
  const [law, setLaw] = useState<RequestLaw>(request?.law ?? "uk_gdpr");
  const [receivedOn, setReceivedOn] = useState(request?.receivedOn ?? today);
  const [clockFrom, setClockFrom] = useState(request?.clockFrom ?? today);
  const [dueOn, setDueOn] = useState(request?.dueOn ?? "");
  const [details, setDetails] = useState(request?.details ?? "");
  const [tried, setTried] = useState(false);
  const needle = search.trim();
  const hits =
    useQuery({
      queryKey: ["people", "search", needle],
      queryFn: () => searchPeople({ data: { q: needle } }),
      enabled: !request && needle.length >= 2,
      placeholderData: (previous) => previous,
    }).data ?? [];
  const clocked = hasClock(law, kind);
  const errors = {
    subject: subjectId ? null : m.validationSelection(),
    requestedBy: requestedBy.trim() ? null : m.privacyRequestedByNeeded(),
    clockFrom: clockFrom >= receivedOn ? null : m.privacyClockBeforeReceipt(),
    dueOn:
      clocked || (dueOn && dueOn >= clockFrom) ? null : m.privacyDueNeeded(),
  };
  const mutation = useMutation({
    mutationFn: () =>
      saveRequest({
        data: {
          ...(request ? { id: request.id } : {}),
          subjectUserId: subjectId,
          requestedBy: requestedBy.trim(),
          relation,
          kind,
          law,
          receivedOn,
          clockFrom,
          dueOn: clocked ? null : dueOn,
          details: details.trim(),
        },
      }),
    meta: { inlineError: true },
  });
  const shown = (error: string | null) =>
    tried && error ? [error] : undefined;
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={request ? m.privacyEditRequest() : m.privacyLogRequest()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        setTried(true);
        if (Object.values(errors).some(Boolean)) return;
        await mutation.mutateAsync().then(
          async (saved) => {
            await refresh();
            toast.success(
              m.privacyRequestSaved({ date: formatDate(saved.dueOn) }),
            );
            onClose();
          },
          () => undefined,
        );
      }}
    >
      {request ? (
        <Facts>
          <Fact label={m.privacyPerson()}>
            <bdi>{displayName(request)}</bdi>
          </Fact>
        </Facts>
      ) : (
        <ComboboxField
          label={m.privacyPerson()}
          hint={m.privacyPersonHint()}
          options={hits.map((hit) => ({
            value: hit.id,
            label: displayName(hit),
          }))}
          value={subjectId ? [subjectId] : []}
          onChange={(next) => setSubjectId(next[0] ?? "")}
          search={search}
          onSearchChange={setSearch}
          errors={shown(errors.subject)}
        />
      )}
      <TextField
        id="request-by"
        label={m.privacyRequestedBy()}
        width="name"
        dir="auto"
        maxLength={120}
        value={requestedBy}
        onChange={(event) => setRequestedBy(event.target.value)}
        errors={shown(errors.requestedBy)}
      />
      <SelectField
        id="request-relation"
        label={m.privacyRelation()}
        value={relation}
        options={(
          ["self", "parent", "representative", "authority"] as const
        ).map((value) => ({ value, label: RELATION_LABEL[value]() }))}
        onChange={(next) => setRelation(next)}
      />
      <SelectField
        id="request-kind"
        label={m.privacyRequestKind()}
        value={kind}
        options={(
          ["access", "correction", "erasure", "objection"] as const
        ).map((value) => ({ value, label: KIND_LABEL[value]() }))}
        onChange={(next) => setKind(next)}
      />
      <SelectField
        id="request-law"
        label={m.privacyLaw()}
        hint={clocked ? LAW_CLOCK[law]() : m.privacyClockOther()}
        value={law}
        options={(
          ["uk_gdpr", "england_record", "ferpa", "egypt", "other"] as const
        ).map((value) => ({ value, label: LAW_LABEL[value]() }))}
        onChange={(next) => setLaw(next)}
      />
      <TextField
        id="request-received"
        label={m.privacyReceived()}
        type="date"
        width="date"
        value={receivedOn}
        onChange={(event) => setReceivedOn(event.target.value)}
      />
      <TextField
        id="request-clock"
        label={m.privacyClockFrom()}
        hint={m.privacyClockFromHint()}
        type="date"
        width="date"
        min={receivedOn}
        value={clockFrom}
        onChange={(event) => setClockFrom(event.target.value)}
        errors={shown(errors.clockFrom)}
      />
      {clocked ? null : (
        <TextField
          id="request-due"
          label={m.privacyDueBy()}
          type="date"
          width="date"
          min={clockFrom}
          value={dueOn}
          onChange={(event) => setDueOn(event.target.value)}
          errors={shown(errors.dueOn)}
        />
      )}
      <FormField id="request-details" label={m.privacyDetails()} optional>
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={4}
            maxLength={2000}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}

export function ExtendSheet({
  open,
  request,
  onClose,
}: {
  open: boolean;
  request: RequestRow;
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      extendRequest({ data: { id: request.id, reason: reason.trim() } }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.privacyExtendTitle({ name: displayName(request) })}
      submitLabel={m.privacyExtendRequest()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        setTried(true);
        if (!reason.trim()) return;
        await mutation.mutateAsync().then(
          async (result) => {
            await refresh();
            toast.success(
              m.privacyExtended({ date: formatDate(result.extendedTo) }),
            );
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {m.privacyExtendHint({ date: formatDate(request.dueOn) })}
      </p>
      <FormField
        id="extend-reason"
        label={m.privacyExtendReason()}
        errors={
          tried && !reason.trim() ? [m.privacyExtendReasonNeeded()] : undefined
        }
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={4}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}

export function CloseRequestSheet({
  open,
  request,
  onClose,
}: {
  open: boolean;
  request: RequestRow;
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const [outcome, setOutcome] = useState<RequestOutcome>("completed");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      closeRequest({ data: { id: request.id, outcome, note: note.trim() } }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.privacyCloseTitle({ name: displayName(request) })}
      submitLabel={m.privacyCloseRequest()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        setTried(true);
        if (!note.trim()) return;
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.privacyRequestClosed());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <SelectField
        id="close-outcome"
        label={m.privacyOutcome()}
        value={outcome}
        options={(["completed", "refused", "withdrawn"] as const).map(
          (value) => ({ value, label: OUTCOME_LABEL[value]() }),
        )}
        onChange={(next) => setOutcome(next)}
      />
      <FormField
        id="close-note"
        label={m.privacyOutcomeNote()}
        hint={m.privacyOutcomeNoteHint()}
        errors={
          tried && !note.trim() ? [m.privacyOutcomeNoteNeeded()] : undefined
        }
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={4}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}
