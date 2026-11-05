import type { BreachLaw, BreachRisk } from "@faridalms/domain/privacy";

import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, Megaphone, Pencil, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Column, RowAction } from "~/components/system/DataTable";
import type { Tone } from "~/components/system/status";

import { DataTable } from "~/components/system/DataTable";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { SheetForm } from "~/components/system/SheetForm";
import { StatusText } from "~/components/system/status";
import { UserText } from "~/components/system/UserText";
import * as m from "~/i18n/messages";
import { breachNotices, closeBreach, saveBreach } from "~/server/privacy";
import {
  formatDate,
  formatInstant,
  formatNumber,
  formatRelativeDays,
  instantFromLocal,
  localInput,
} from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { PrivacyOverview } from "./DataProtection";

export type BreachRow = PrivacyOverview["breaches"][number];

const LAW_LABEL: Record<BreachLaw, () => string> = {
  uk_gdpr: m.privacyLawUk,
  egypt: m.privacyLawEgypt,
  other: m.privacyLawOther,
};

const RISK_LABEL: Record<BreachRisk, () => string> = {
  unlikely: m.privacyRiskUnlikely,
  risk: m.privacyRiskSome,
  high: m.privacyRiskHigh,
};

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["privacy"] });
}

type Standing = { tone: Tone; label: string };

/** Where telling the regulator stands, and how urgent it is. */
function regulatorStanding(row: BreachRow, now: number): Standing {
  if (row.regulatorNotifiedAt)
    return {
      tone: "success",
      label: m.privacyToldOn({
        date: formatInstant(row.regulatorNotifiedAt, "stamp"),
      }),
    };
  if (row.regulatorReason)
    return { tone: "neutral", label: m.privacyNotTold() };
  if (!row.regulatorRequired)
    return { tone: "neutral", label: m.privacyNotRequired() };
  if (row.closedAt) return { tone: "neutral", label: m.privacyNotTold() };
  return Date.parse(row.regulatorDueAt) < now
    ? { tone: "danger", label: m.privacyOverdue() }
    : {
        tone: "warning",
        label: m.privacyTellBy({
          date: formatInstant(row.regulatorDueAt, "stamp"),
        }),
      };
}

function peopleStanding(row: BreachRow, today: string): Standing {
  if (row.peopleNotifiedAt)
    return {
      tone: "success",
      label: m.privacyToldOn({
        date: formatInstant(row.peopleNotifiedAt, "stamp"),
      }),
    };
  if (row.peopleReason) return { tone: "neutral", label: m.privacyNotTold() };
  if (!row.peopleRequired)
    return { tone: "neutral", label: m.privacyNotRequired() };
  if (row.closedAt) return { tone: "neutral", label: m.privacyNotTold() };
  if (!row.peopleDueOn)
    return { tone: "warning", label: m.privacyWithoutDelay() };
  return row.peopleDueOn < today
    ? { tone: "danger", label: m.privacyOverdue() }
    : {
        tone: "warning",
        label: m.privacyDueIn({
          when: formatRelativeDays(row.peopleDueOn, Date.parse(today)),
        }),
      };
}

function BreachTitle({ row }: { row: BreachRow }) {
  return <UserText text={row.title} className="font-medium" />;
}

function breachColumns(now: number, today: string): Column<BreachRow>[] {
  return [
    {
      id: "title",
      header: m.privacyBreach(),
      primary: true,
      cell: (row) => (
        <span className="grid gap-0.5">
          <BreachTitle row={row} />
          <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
            {[
              RISK_LABEL[row.risk](),
              row.peopleAffected === null
                ? null
                : m.privacyPeopleCount({
                    count: row.peopleAffected,
                    value: formatNumber(row.peopleAffected),
                  }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      ),
    },
    {
      id: "discovered",
      header: m.privacyDiscovered(),
      cell: (row) => formatInstant(row.discoveredAt, "stamp"),
    },
    {
      id: "regulator",
      header: m.privacyRegulator(),
      cell: (row) => {
        const { tone, label } = regulatorStanding(row, now);
        return <StatusText tone={tone}>{label}</StatusText>;
      },
    },
    {
      id: "people",
      header: m.privacyPeopleAffected(),
      cell: (row) => {
        const { tone, label } = peopleStanding(row, today);
        return <StatusText tone={tone}>{label}</StatusText>;
      },
    },
    {
      id: "status",
      header: m.privacyStatus(),
      cell: (row) =>
        row.closedAt ? (
          <StatusText tone="success">{m.privacyClosed()}</StatusText>
        ) : (
          <StatusText tone="info">{m.privacyOpen()}</StatusText>
        ),
    },
  ];
}

/**
 * On a phone the card shows only the nearest deadline still to meet, in
 * days; the table beside it on wider screens gives the exact times.
 */
function nearest(row: BreachRow, now: number, today: string): Standing {
  if (row.closedAt) return { tone: "success", label: m.privacyClosed() };
  const pending = [
    row.regulatorRequired && !row.regulatorNotifiedAt && !row.regulatorReason
      ? Date.parse(row.regulatorDueAt)
      : null,
    row.peopleRequired && !row.peopleNotifiedAt && !row.peopleReason
      ? row.peopleDueOn
        ? Date.parse(`${row.peopleDueOn}T23:59:59Z`)
        : now
      : null,
  ].filter((due): due is number => due !== null);
  if (pending.length === 0) return { tone: "info", label: m.privacyOpen() };
  const due = Math.min(...pending);
  if (due < now) return { tone: "danger", label: m.privacyOverdue() };
  return {
    tone: "warning",
    label: m.privacyDueIn({
      when: formatRelativeDays(new Date(due).toISOString(), Date.parse(today)),
    }),
  };
}

function breachCard(now: number, today: string) {
  return {
    title: (row: BreachRow) => <BreachTitle row={row} />,
    status: (row: BreachRow) => {
      const { tone, label } = nearest(row, now, today);
      return <StatusText tone={tone}>{label}</StatusText>;
    },
    fact: (row: BreachRow) =>
      m.privacyDiscoveredOn({ date: formatInstant(row.discoveredAt, "stamp") }),
  };
}

export function BreachesTable({
  overview,
  onAdd,
  onEdit,
  onNotices,
  onClose,
}: {
  overview: PrivacyOverview;
  onAdd: () => void;
  onEdit: (row: BreachRow) => void;
  onNotices: (row: BreachRow) => void;
  onClose: (row: BreachRow) => void;
}) {
  const [now] = useState(() => Date.now());
  const rowActions = (row: BreachRow): RowAction[] =>
    row.closedAt
      ? []
      : [
          {
            label: m.privacyRecordNotices(),
            icon: Megaphone,
            onSelect: () => onNotices(row),
          },
          {
            label: m.privacyCloseBreach(),
            icon: CircleCheck,
            onSelect: () => onClose(row),
          },
          {
            label: m.privacyEditBreach(),
            icon: Pencil,
            onSelect: () => onEdit(row),
          },
        ];
  return (
    <DataTable
      caption={m.privacyBreachesCaption()}
      rows={overview.breaches}
      columns={breachColumns(now, overview.today)}
      rowLabel={(row) => row.title}
      rowActions={rowActions}
      card={breachCard(now, overview.today)}
      empty={{
        icon: ShieldAlert,
        title: m.privacyNoBreaches(),
        description: m.privacyNoBreachesHint(),
        action: (
          <Button type="button" className="max-md:h-10" onClick={onAdd}>
            <ShieldAlert aria-hidden />
            {m.privacyLogBreach()}
          </Button>
        ),
      }}
    />
  );
}

const localNow = () => localInput(new Date().toISOString());

export function BreachSheet({
  open,
  breach,
  onClose,
}: {
  open: boolean;
  breach: BreachRow | null;
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const [title, setTitle] = useState(breach?.title ?? "");
  const [description, setDescription] = useState(breach?.description ?? "");
  const [discovered, setDiscovered] = useState(
    breach ? localInput(breach.discoveredAt) : localNow(),
  );
  const [law, setLaw] = useState<BreachLaw>(breach?.law ?? "egypt");
  const [risk, setRisk] = useState<BreachRisk>(breach?.risk ?? "risk");
  const [affected, setAffected] = useState(
    breach?.peopleAffected === null || breach === null
      ? ""
      : String(breach.peopleAffected),
  );
  const [tried, setTried] = useState(false);
  const count = affected.trim() === "" ? null : Number(affected);
  const errors = {
    title: title.trim() ? null : m.privacyBreachTitleNeeded(),
    description: description.trim() ? null : m.privacyBreachWhatNeeded(),
    discovered: discovered ? null : m.privacyDiscoveredNeeded(),
    affected:
      count === null || (Number.isInteger(count) && count >= 0)
        ? null
        : m.privacyPeopleInvalid(),
  };
  const mutation = useMutation({
    mutationFn: () =>
      saveBreach({
        data: {
          ...(breach ? { id: breach.id, expectedVersion: breach.version } : {}),
          title: title.trim(),
          description: description.trim(),
          discoveredAt: instantFromLocal(discovered),
          law,
          risk,
          peopleAffected: count,
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
      title={breach ? m.privacyEditBreach() : m.privacyLogBreach()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        setTried(true);
        if (Object.values(errors).some(Boolean)) return;
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.privacyBreachSaved());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <TextField
        id="breach-title"
        label={m.privacyBreachTitle()}
        dir="auto"
        maxLength={120}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        errors={shown(errors.title)}
      />
      <FormField
        id="breach-description"
        label={m.privacyBreachWhat()}
        hint={m.privacyBreachWhatHint()}
        errors={shown(errors.description)}
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={5}
            maxLength={4000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        )}
      </FormField>
      <TextField
        id="breach-discovered"
        label={m.privacyDiscovered()}
        hint={m.privacyDiscoveredHint()}
        type="datetime-local"
        value={discovered}
        onChange={(event) => setDiscovered(event.target.value)}
        errors={shown(errors.discovered)}
      />
      <SelectField
        id="breach-law"
        label={m.privacyLaw()}
        hint={law === "other" ? m.privacyBreachLawOther() : undefined}
        value={law}
        options={(["uk_gdpr", "egypt", "other"] as const).map((value) => ({
          value,
          label: LAW_LABEL[value](),
        }))}
        onChange={(next) => setLaw(next)}
      />
      <SelectField
        id="breach-risk"
        label={m.privacyRisk()}
        hint={m.privacyRiskHint()}
        value={risk}
        options={(["unlikely", "risk", "high"] as const).map((value) => ({
          value,
          label: RISK_LABEL[value](),
        }))}
        onChange={(next) => setRisk(next)}
      />
      <TextField
        id="breach-affected"
        label={m.privacyPeopleAffectedCount()}
        optional
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        width="score"
        value={affected}
        onChange={(event) => setAffected(event.target.value)}
        errors={shown(errors.affected)}
      />
    </SheetForm>
  );
}

/** One notice: told at a time, or not told with the reason why. */
function Notice({
  id,
  label,
  told,
  onTold,
  at,
  onAt,
  reason,
  onReason,
  errors,
}: {
  id: string;
  label: string;
  told: boolean;
  onTold: (next: boolean) => void;
  at: string;
  onAt: (next: string) => void;
  reason: string;
  onReason: (next: string) => void;
  errors: { at: string | null; reason: string | null };
}) {
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-1 text-sm leading-5 font-medium">{label}</legend>
      <label className="flex items-center gap-2 text-sm leading-5">
        <Checkbox checked={told} onCheckedChange={(next) => onTold(next)} />
        {m.privacyWasTold()}
      </label>
      {told ? (
        <TextField
          id={`${id}-at`}
          label={m.privacyToldAt()}
          type="datetime-local"
          value={at}
          onChange={(event) => onAt(event.target.value)}
          errors={errors.at ? [errors.at] : undefined}
        />
      ) : (
        <FormField
          id={`${id}-reason`}
          label={m.privacyWhyNotTold()}
          optional
          hint={m.privacyWhyNotToldHint()}
          errors={errors.reason ? [errors.reason] : undefined}
        >
          {(control) => (
            <Textarea
              {...control}
              dir="auto"
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(event) => onReason(event.target.value)}
            />
          )}
        </FormField>
      )}
    </fieldset>
  );
}

export function NoticesSheet({
  open,
  breach,
  onClose,
}: {
  open: boolean;
  breach: BreachRow;
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const [regulatorTold, setRegulatorTold] = useState(
    breach.regulatorNotifiedAt !== null,
  );
  const [regulatorAt, setRegulatorAt] = useState(
    localInput(breach.regulatorNotifiedAt) || localNow(),
  );
  const [reference, setReference] = useState(breach.regulatorReference ?? "");
  const [regulatorReason, setRegulatorReason] = useState(
    breach.regulatorReason ?? "",
  );
  const [peopleTold, setPeopleTold] = useState(
    breach.peopleNotifiedAt !== null,
  );
  const [peopleAt, setPeopleAt] = useState(
    localInput(breach.peopleNotifiedAt) || localNow(),
  );
  const [peopleReason, setPeopleReason] = useState(breach.peopleReason ?? "");
  const [tried, setTried] = useState(false);
  const missingAt = tried ? m.privacyToldAtNeeded() : null;
  const mutation = useMutation({
    mutationFn: () =>
      breachNotices({
        data: {
          id: breach.id,
          regulatorNotifiedAt: regulatorTold
            ? instantFromLocal(regulatorAt)
            : null,
          regulatorReference:
            regulatorTold && reference.trim() ? reference.trim() : null,
          regulatorReason:
            !regulatorTold && regulatorReason.trim()
              ? regulatorReason.trim()
              : null,
          peopleNotifiedAt: peopleTold ? instantFromLocal(peopleAt) : null,
          peopleReason:
            !peopleTold && peopleReason.trim() ? peopleReason.trim() : null,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.privacyRecordNotices()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        setTried(true);
        if ((regulatorTold && !regulatorAt) || (peopleTold && !peopleAt))
          return;
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.privacyNoticesSaved());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {[
          breach.regulatorRequired
            ? m.privacyRegulatorDue({
                date: formatInstant(breach.regulatorDueAt, "stamp"),
              })
            : m.privacyRegulatorOptional(),
          breach.peopleRequired
            ? breach.peopleDueOn
              ? m.privacyPeopleDue({ date: formatDate(breach.peopleDueOn) })
              : m.privacyPeopleNoDelay()
            : m.privacyPeopleOptional(),
        ].join(" ")}
      </p>
      <Notice
        id="regulator"
        label={m.privacyRegulator()}
        told={regulatorTold}
        onTold={setRegulatorTold}
        at={regulatorAt}
        onAt={setRegulatorAt}
        reason={regulatorReason}
        onReason={setRegulatorReason}
        errors={{
          at: regulatorTold && !regulatorAt ? missingAt : null,
          reason: null,
        }}
      />
      {regulatorTold ? (
        <TextField
          id="regulator-reference"
          label={m.privacyRegulatorReference()}
          optional
          dir="auto"
          maxLength={120}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
      ) : null}
      <Notice
        id="people"
        label={m.privacyPeopleAffected()}
        told={peopleTold}
        onTold={setPeopleTold}
        at={peopleAt}
        onAt={setPeopleAt}
        reason={peopleReason}
        onReason={setPeopleReason}
        errors={{
          at: peopleTold && !peopleAt ? missingAt : null,
          reason: null,
        }}
      />
    </SheetForm>
  );
}

export function CloseBreachSheet({
  open,
  breach,
  onClose,
}: {
  open: boolean;
  breach: BreachRow;
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const [actions, setActions] = useState(breach.actions ?? "");
  const [tried, setTried] = useState(false);
  const settled =
    (breach.regulatorNotifiedAt ?? breach.regulatorReason) !== null &&
    (breach.peopleNotifiedAt ?? breach.peopleReason) !== null;
  const mutation = useMutation({
    mutationFn: () =>
      closeBreach({ data: { id: breach.id, actions: actions.trim() } }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.privacyCloseBreach()}
      submitLabel={m.privacyCloseBreach()}
      pending={mutation.isPending}
      error={
        mutation.error
          ? getMessageFromError(mutation.error)
          : tried && !settled
            ? m.privacyErrBreachNoticesOpen()
            : null
      }
      onSubmit={async () => {
        setTried(true);
        if (!settled || !actions.trim()) return;
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.privacyBreachClosed());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <FormField
        id="breach-actions"
        label={m.privacyBreachActions()}
        hint={m.privacyBreachActionsHint()}
        errors={
          tried && !actions.trim()
            ? [m.privacyBreachActionsNeeded()]
            : undefined
        }
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={5}
            maxLength={4000}
            value={actions}
            onChange={(event) => setActions(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}
