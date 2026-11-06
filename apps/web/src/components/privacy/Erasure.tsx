import type { ErasureBasis } from "@faridalms/domain/privacy";

import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { displayName } from "~/components/people/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { approveErasure, runErasure } from "~/server/privacy";
import { formatInstant, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { PrivacyOverview, ReviewRow } from "./DataProtection";

type ErasureRow = PrivacyOverview["erasures"][number];

const BASIS_LABEL: Record<ErasureBasis, () => string> = {
  retention_schedule: m.privacyBasisSchedule,
  data_subject_request: m.privacyBasisRequest,
  regulator_order: m.privacyBasisOrder,
};

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["privacy"] });
}

/** The open erasure request a person made, which an erasure would fulfil. */
export function erasureRequestOf(
  overview: PrivacyOverview,
  userId: string,
): PrivacyOverview["requests"][number] | undefined {
  return overview.requests.find(
    (row) =>
      row.subjectUserId === userId && row.kind === "erasure" && !row.outcome,
  );
}

/** Whether an approver may start erasing this leaver today. */
export function erasable(overview: PrivacyOverview, row: ReviewRow): boolean {
  if (row.block?.kind === "hold" || row.block?.kind === "exam") return false;
  const asked = erasureRequestOf(overview, row.userId);
  if (row.block?.kind === "request" && !asked) return false;
  return (
    asked !== undefined || (row.dueOn !== null && row.dueOn <= overview.today)
  );
}

function bases(overview: PrivacyOverview, row: ReviewRow): ErasureBasis[] {
  return [
    ...(row.block === null && row.dueOn !== null && row.dueOn <= overview.today
      ? (["retention_schedule"] as const)
      : []),
    ...(erasureRequestOf(overview, row.userId)
      ? (["data_subject_request"] as const)
      : []),
    ...(row.block === null ? (["regulator_order"] as const) : []),
  ];
}

export interface ErasureSheetProps {
  open: boolean;
  overview: PrivacyOverview;
  person: ReviewRow;
  onClose: () => void;
}

/**
 * Erasing someone cannot be undone, so the sheet says exactly what goes and
 * what stays, and asks for the person's name typed out before it runs.
 */
export function ErasureSheet({
  open,
  overview,
  person,
  onClose,
}: ErasureSheetProps) {
  const refresh = useRefresh();
  const options = bases(overview, person);
  const [basis, setBasis] = useState<ErasureBasis>(
    options[0] ?? "regulator_order",
  );
  const [reference, setReference] = useState("");
  const [typed, setTyped] = useState("");
  const [tried, setTried] = useState(false);
  const name = displayName(person);
  const request = erasureRequestOf(overview, person.userId);
  const errors = {
    reference:
      basis === "regulator_order" && !reference.trim()
        ? m.privacyOrderReferenceNeeded()
        : null,
    typed: typed.trim() === name.trim() ? null : m.privacyTypeNameMismatch(),
  };
  // Approving and running are separate calls; once approved, a failed run
  // is retried from the list rather than approved a second time.
  const erase = useMutation({
    mutationFn: async () => {
      await approveErasure({
        data: {
          subjectUserId: person.userId,
          basis,
          requestId:
            basis === "data_subject_request" ? (request?.id ?? null) : null,
          reference: basis === "regulator_order" ? reference.trim() : null,
        },
      });
      return runErasure({ data: { subjectUserId: person.userId } }).then(
        () => true,
        () => false,
      );
    },
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.privacyEraseTitle({ name })}
      submitLabel={m.privacyErase()}
      destructive
      pending={erase.isPending}
      error={erase.error ? getMessageFromError(erase.error) : null}
      onSubmit={async () => {
        setTried(true);
        if (errors.reference || errors.typed) return;
        await erase.mutateAsync().then(
          async (ran) => {
            await refresh();
            if (ran) toast.success(m.privacyErased());
            else toast.error(m.privacyErasureNotRun());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <div className="grid gap-3 text-sm leading-5">
        <p>{m.privacyEraseGoes()}</p>
        <p className="text-muted-foreground">{m.privacyEraseStays()}</p>
        <p className="font-medium text-destructive">
          {m.privacyEraseIrreversible()}
        </p>
      </div>
      <SelectField
        id="erasure-basis"
        label={m.privacyBasis()}
        value={basis}
        options={options.map((value) => ({
          value,
          label: BASIS_LABEL[value](),
        }))}
        onChange={(next) => setBasis(next)}
      />
      {basis === "regulator_order" ? (
        <TextField
          id="erasure-reference"
          label={m.privacyOrderReference()}
          dir="auto"
          maxLength={120}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          errors={tried && errors.reference ? [errors.reference] : undefined}
        />
      ) : null}
      <TextField
        id="erasure-confirm"
        label={m.privacyTypeName({ name })}
        dir="auto"
        autoComplete="off"
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        errors={tried && errors.typed ? [errors.typed] : undefined}
      />
    </SheetForm>
  );
}

export interface RunErasureDialogProps {
  open: boolean;
  person: ReviewRow;
  onClose: () => void;
}

/** Runs an erasure approved earlier that did not finish. */
export function RunErasureDialog({
  open,
  person,
  onClose,
}: RunErasureDialogProps) {
  const refresh = useRefresh();
  const run = useMutation({
    mutationFn: () => runErasure({ data: { subjectUserId: person.userId } }),
    meta: { inlineError: true },
  });
  return (
    <ConfirmDialog
      open={open}
      title={m.privacyRunErasureTitle({ name: displayName(person) })}
      body={m.privacyRunErasureBody()}
      confirmLabel={m.privacyErase()}
      pending={run.isPending}
      error={run.error ? getMessageFromError(run.error) : undefined}
      onCancel={onClose}
      onConfirm={() => {
        void run.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.privacyErased());
            onClose();
          },
          () => undefined,
        );
      }}
    />
  );
}

interface ErasureLineProps {
  row: ErasureRow;
}

function ErasureLine({ row }: ErasureLineProps) {
  const facts = [
    BASIS_LABEL[row.basis](),
    m.privacyApprovedBy({
      date: formatInstant(row.approvedAt, "stamp"),
      name: inLocale(row.approvedByEn, row.approvedByAr),
    }),
    m.privacyErasureItems({
      count: row.items,
      value: formatNumber(row.items),
    }),
  ];
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-3">
      <span className="grid min-w-0 gap-0.5">
        <span className="text-sm leading-5 font-medium">
          {m.privacyErasedPerson()}
        </span>
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {facts.join(" · ")}
        </span>
      </span>
      {row.erasedAt ? (
        <StatusText tone="success">
          {m.privacyErasedOn({ date: formatInstant(row.erasedAt, "stamp") })}
        </StatusText>
      ) : (
        <StatusText tone="warning">{m.privacyErasurePending()}</StatusText>
      )}
    </li>
  );
}

export interface ErasuresSectionProps {
  overview: PrivacyOverview;
}

/** The proof of each erasure, kept after the person's data is gone. */
export function ErasuresSection({ overview }: ErasuresSectionProps) {
  if (overview.erasures.length === 0) return null;
  return (
    <RecordSection
      title={m.privacyErasuresTitle()}
      description={m.privacyErasuresHint()}
    >
      <ul className="grid divide-y">
        {overview.erasures.map((row) => (
          <ErasureLine key={row.id} row={row} />
        ))}
      </ul>
    </RecordSection>
  );
}
