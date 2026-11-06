import type { StudentRetention } from "@faridalms/domain/privacy";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type { Tone } from "@faridalms/ui/system/status";

import { Button } from "@faridalms/ui/button";
import { ComboboxField } from "@faridalms/ui/system/combobox-field";
import { DataTable } from "@faridalms/ui/system/data-table";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { Fact, Facts, RecordSection } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Eraser, Lock, LockOpen, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { getPrivacyOverview } from "~/server/privacy";

import { sessionName } from "~/components/exams/names";
import { displayName } from "~/components/people/format";
import { UserText } from "~/components/system/UserText";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { placeHold, releaseHold, saveRetention } from "~/server/privacy";
import { searchPeople } from "~/server/students";
import { formatInstant, formatDate, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { erasable, ErasuresSection } from "./Erasure";

export type PrivacyOverview = Awaited<ReturnType<typeof getPrivacyOverview>>;
export type ReviewRow = PrivacyOverview["review"][number];
export type HoldRow = PrivacyOverview["holds"][number];
type Rules = PrivacyOverview["rules"];

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["privacy"] });
}

function standing(
  row: ReviewRow,
  today: string,
  pending: ReadonlySet<string>,
): { tone: Tone; label: string } {
  if (pending.has(row.userId))
    return { tone: "warning", label: m.privacyErasurePending() };
  if (row.block?.kind === "hold")
    return { tone: "info", label: m.privacyOnHold() };
  if (row.block?.kind === "request")
    return {
      tone: "info",
      label: m.privacyRequestOpen({ date: formatDate(row.block.dueOn) }),
    };
  if (row.block?.kind === "exam")
    return {
      tone: "neutral",
      label: m.privacyExamUntil({ date: formatDate(row.block.until) }),
    };
  if (row.noBirthDate)
    return { tone: "warning", label: m.privacyNoBirthDate() };
  if (row.dueOn === null) return { tone: "neutral", label: m.privacyKept() };
  return row.dueOn <= today
    ? { tone: "warning", label: m.privacyDue() }
    : { tone: "neutral", label: m.privacyNotYetDue() };
}

const KIND_LABEL: Record<ReviewRow["kind"], () => string> = {
  student: m.privacyKindStudent,
  staff: m.privacyKindStaff,
  applicant: m.privacyKindApplicant,
};

function reviewColumns(
  today: string,
  pending: ReadonlySet<string>,
): Column<ReviewRow>[] {
  return [
    {
      id: "name",
      header: m.privacyPerson(),
      primary: true,
      cell: (row) => (
        <span className="truncate font-medium" dir="auto">
          {displayName(row)}
        </span>
      ),
    },
    {
      id: "kind",
      header: m.privacyWas(),
      cell: (row) => KIND_LABEL[row.kind](),
    },
    {
      id: "left",
      header: m.privacyLeftOn(),
      cell: (row) => formatDate(row.leftOn),
    },
    {
      id: "due",
      header: m.privacyReviewFrom(),
      cell: (row) =>
        row.dueOn ? (
          formatDate(row.dueOn)
        ) : (
          <span className="text-muted-foreground">–</span>
        ),
    },
    {
      id: "status",
      header: m.privacyStatus(),
      cell: (row) => (
        <StandingStatus row={row} today={today} pending={pending} />
      ),
    },
  ];
}

interface StandingStatusProps {
  row: ReviewRow;
  today: string;
  pending: ReadonlySet<string>;
}

function StandingStatus({ row, today, pending }: StandingStatusProps) {
  const { tone, label } = standing(row, today, pending);
  return <StatusText tone={tone}>{label}</StatusText>;
}

export interface PersonNameProps {
  row: { fullNameEn: string | null; fullNameAr: string | null };
}

export function PersonName({ row }: PersonNameProps) {
  return (
    <span className="truncate font-medium" dir="auto">
      {displayName(row)}
    </span>
  );
}

function reviewCard(today: string, pending: ReadonlySet<string>) {
  return {
    title: (row: ReviewRow) => <PersonName row={row} />,
    status: (row: ReviewRow) => (
      <StandingStatus row={row} today={today} pending={pending} />
    ),
    fact: (row: ReviewRow) =>
      m.privacyLeftFact({
        kind: KIND_LABEL[row.kind](),
        date: formatDate(row.leftOn),
      }),
  };
}

function holdColumns(): Column<HoldRow>[] {
  return [
    {
      id: "name",
      header: m.privacyPerson(),
      primary: true,
      cell: (row) => (
        <span className="grid gap-0.5">
          <PersonName row={row} />
          <UserText
            text={row.reason}
            className="text-[13px] leading-[18px] text-muted-foreground"
          />
        </span>
      ),
    },
    {
      id: "placed",
      header: m.privacyPlaced(),
      cell: (row) =>
        m.privacyPlacedBy({
          date: formatInstant(row.placedAt, "stamp"),
          name: inLocale(row.placedByEn, row.placedByAr),
        }),
    },
  ];
}

const holdCard = {
  title: (row: HoldRow) => <PersonName row={row} />,
  fact: (row: HoldRow) => <UserText text={row.reason} />,
};

const dueKey = (row: ReviewRow) => row.dueOn ?? "9999-12-31";

/** Leavers in the order they come up, those due first. */
function reviewOrder(rows: ReviewRow[]): ReviewRow[] {
  return rows.toSorted(
    (a, b) =>
      dueKey(a).localeCompare(dueKey(b)) || a.leftOn.localeCompare(b.leftOn),
  );
}

export interface ReviewTableProps {
  overview: PrivacyOverview;
  onHold: (row: ReviewRow) => void;
  onRelease: (hold: HoldRow) => void;
  onRules: () => void;
  onErase: (row: ReviewRow) => void;
  onRun: (row: ReviewRow) => void;
}

export function ReviewTable({
  overview,
  onHold,
  onRelease,
  onRules,
  onErase,
  onRun,
}: ReviewTableProps) {
  const holdOf = new Map(overview.holds.map((row) => [row.subjectUserId, row]));
  const pending = new Set(
    overview.erasures
      .filter((row) => !row.erasedAt)
      .map((row) => row.subjectUserId),
  );
  const approver = overview.erasure.approve && overview.erasure.available;
  const rowActions = (row: ReviewRow): RowAction[] => {
    const hold = holdOf.get(row.userId);
    const erasure: RowAction[] = !approver
      ? []
      : pending.has(row.userId)
        ? [
            {
              label: m.privacyRunErasure(),
              icon: Eraser,
              onSelect: () => onRun(row),
            },
          ]
        : erasable(overview, row)
          ? [
              {
                label: m.privacyEraseAction(),
                icon: Eraser,
                onSelect: () => onErase(row),
              },
            ]
          : [];
    return [
      ...erasure,
      hold
        ? {
            label: m.privacyReleaseHold(),
            icon: LockOpen,
            onSelect: () => onRelease(hold),
          }
        : {
            label: m.privacyPlaceHold(),
            icon: Lock,
            onSelect: () => onHold(row),
          },
    ];
  };
  const noRules =
    overview.rules.studentRule === null &&
    overview.rules.staffYears === null &&
    overview.rules.applicantMonths === null;
  return (
    <div className="grid gap-6">
      {noRules ? (
        <p className="text-sm leading-5 text-muted-foreground">
          {m.privacyNoRulesYet()}{" "}
          <button
            type="button"
            className="font-medium text-primary underline-offset-4 hover:underline"
            onClick={onRules}
          >
            {m.privacySetRules()}
          </button>
        </p>
      ) : null}
      {overview.erasure.approve && !overview.erasure.available ? (
        <p className="text-sm leading-5 text-muted-foreground">
          {m.privacyErasureUnavailable()}
        </p>
      ) : null}
      <DataTable
        caption={m.privacyReviewCaption()}
        rows={reviewOrder(overview.review)}
        columns={reviewColumns(overview.today, pending)}
        rowLabel={displayName}
        rowActions={rowActions}
        card={reviewCard(overview.today, pending)}
        empty={{
          icon: ShieldCheck,
          title: m.privacyNoLeavers(),
          description: m.privacyNoLeaversHint(),
        }}
      />
      {overview.sessions.length ? (
        <RecordSection
          title={m.privacyExamTitle()}
          description={m.privacyExamHint()}
        >
          <ul className="grid divide-y">
            {overview.sessions.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-3"
              >
                <span className="grid min-w-0 gap-0.5">
                  <bdi className="text-sm leading-5 font-medium">
                    {sessionName(row)}
                  </bdi>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {m.privacyExamCounts({
                      assignments: formatNumber(row.assignments),
                      handedIn: formatNumber(row.handedIn),
                    })}
                  </span>
                </span>
                <StatusText tone="warning">
                  {m.privacyExamPast({ date: formatDate(row.keepUntil) })}
                </StatusText>
              </li>
            ))}
          </ul>
        </RecordSection>
      ) : null}
      <ErasuresSection overview={overview} />
    </div>
  );
}

export interface HoldsTableProps {
  overview: PrivacyOverview;
  onAdd: () => void;
  onRelease: (hold: HoldRow) => void;
}

export function HoldsTable({ overview, onAdd, onRelease }: HoldsTableProps) {
  return (
    <DataTable
      caption={m.privacyHoldsCaption()}
      rows={overview.holds}
      columns={holdColumns()}
      rowLabel={displayName}
      rowActions={(row) => [
        {
          label: m.privacyReleaseHold(),
          icon: LockOpen,
          onSelect: () => onRelease(row),
        },
      ]}
      card={holdCard}
      empty={{
        icon: Archive,
        title: m.privacyNoHolds(),
        description: m.privacyNoHoldsHint(),
        action: (
          <Button type="button" className="max-md:h-10" onClick={onAdd}>
            <Lock aria-hidden />
            {m.privacyPlaceHold()}
          </Button>
        ),
      }}
    />
  );
}

function studentRuleText(rules: Rules): string {
  if (rules.studentRule === null || rules.studentValue === null)
    return m.privacyRuleKeep();
  const value = formatNumber(rules.studentValue);
  return rules.studentRule === "until_age"
    ? m.privacyRuleUntilAge({ age: value })
    : m.privacyRuleYears({ count: rules.studentValue, value });
}

export interface RetentionSectionProps {
  rules: Rules;
  onEdit: () => void;
}

export function RetentionSection({ rules, onEdit }: RetentionSectionProps) {
  return (
    <RecordSection
      title={m.privacyRulesTitle()}
      description={m.privacyRulesHint()}
      edit={{ label: m.privacyChangeRules(), onClick: onEdit }}
    >
      <Facts>
        <Fact label={m.privacyStudents()}>{studentRuleText(rules)}</Fact>
        <Fact label={m.privacyStaff()}>
          {rules.staffYears === null
            ? m.privacyRuleKeep()
            : m.privacyRuleYears({
                count: rules.staffYears,
                value: formatNumber(rules.staffYears),
              })}
        </Fact>
        <Fact label={m.privacyApplicants()}>
          {rules.applicantMonths === null
            ? m.privacyRuleKeep()
            : m.privacyRuleApplicantMonths({
                value: formatNumber(rules.applicantMonths),
              })}
        </Fact>
      </Facts>
    </RecordSection>
  );
}

const KEEP = "keep";

export interface RetentionSheetProps {
  open: boolean;
  rules: Rules;
  onClose: () => void;
}

export function RetentionSheet({ open, rules, onClose }: RetentionSheetProps) {
  const refresh = useRefresh();
  const [rule, setRule] = useState<StudentRetention | typeof KEEP>(
    rules.studentRule ?? KEEP,
  );
  const [value, setValue] = useState(
    rules.studentValue === null ? "" : String(rules.studentValue),
  );
  const [staff, setStaff] = useState(
    rules.staffYears === null ? "" : String(rules.staffYears),
  );
  const [applicants, setApplicants] = useState(
    rules.applicantMonths === null ? "" : String(rules.applicantMonths),
  );
  const [tried, setTried] = useState(false);
  const studentValue = rule === KEEP ? null : Number(value);
  const valueError =
    rule === KEEP
      ? null
      : !Number.isInteger(studentValue) ||
          (studentValue ?? 0) < (rule === "until_age" ? 18 : 1) ||
          (studentValue ?? 0) > 100
        ? rule === "until_age"
          ? m.privacyAgeInvalid()
          : m.privacyYearsInvalid()
        : null;
  const staffYears = staff.trim() === "" ? null : Number(staff);
  const staffError =
    staffYears !== null &&
    (!Number.isInteger(staffYears) || staffYears < 1 || staffYears > 100)
      ? m.privacyYearsInvalid()
      : null;
  const applicantMonths = applicants.trim() === "" ? null : Number(applicants);
  const applicantError =
    applicantMonths !== null &&
    (!Number.isInteger(applicantMonths) ||
      applicantMonths < 1 ||
      applicantMonths > 120)
      ? m.privacyMonthsInvalid()
      : null;
  const mutation = useMutation({
    mutationFn: () =>
      saveRetention({
        data: {
          studentRule: rule === KEEP ? null : rule,
          studentValue,
          staffYears,
          applicantMonths,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.privacyRulesTitle()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        setTried(true);
        if (valueError || staffError || applicantError) return;
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.privacyRulesSaved());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <SelectField
        id="retention-rule"
        label={m.privacyStudents()}
        hint={m.privacyStudentsHint()}
        value={rule}
        options={[
          { value: KEEP, label: m.privacyRuleKeep() },
          { value: "years_after_leaving", label: m.privacyRuleYearsOption() },
          { value: "until_age", label: m.privacyRuleAgeOption() },
        ]}
        onChange={(next) => setRule(next)}
      />
      {rule === KEEP ? null : (
        <TextField
          id="retention-value"
          label={
            rule === "until_age" ? m.privacyAge() : m.privacyYearsAfterLeaving()
          }
          type="number"
          inputMode="numeric"
          min={rule === "until_age" ? 18 : 1}
          max={100}
          step={1}
          width="score"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          errors={tried && valueError ? [valueError] : undefined}
        />
      )}
      <TextField
        id="retention-staff"
        label={m.privacyStaffYears()}
        hint={m.privacyStaffHint()}
        optional
        type="number"
        inputMode="numeric"
        min={1}
        max={100}
        step={1}
        width="score"
        value={staff}
        onChange={(event) => setStaff(event.target.value)}
        errors={tried && staffError ? [staffError] : undefined}
      />
      <TextField
        id="retention-applicants"
        label={m.privacyApplicantMonths()}
        hint={m.privacyApplicantHint()}
        optional
        type="number"
        inputMode="numeric"
        min={1}
        max={120}
        step={1}
        width="score"
        value={applicants}
        onChange={(event) => setApplicants(event.target.value)}
        errors={tried && applicantError ? [applicantError] : undefined}
      />
    </SheetForm>
  );
}

export interface HoldSheetProps {
  open: boolean;
  person: { id: string; name: string } | null;
  onClose: () => void;
}

/** A hold on someone named already, or on a person searched for. */
export function HoldSheet({ open, person, onClose }: HoldSheetProps) {
  const refresh = useRefresh();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState("");
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const needle = search.trim();
  const hits =
    useQuery({
      queryKey: ["people", "search", needle],
      queryFn: () => searchPeople({ data: { q: needle } }),
      enabled: !person && needle.length >= 2,
      placeholderData: (previous) => previous,
    }).data ?? [];
  const subjectId = person?.id ?? picked;
  const mutation = useMutation({
    mutationFn: () =>
      placeHold({ data: { subjectUserId: subjectId, reason: reason.trim() } }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={
        person
          ? m.privacyHoldTitleFor({ name: person.name })
          : m.privacyHoldTitle()
      }
      submitLabel={m.privacyPlaceHold()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        setTried(true);
        if (!subjectId || !reason.trim()) return;
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.privacyHoldPlaced());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {m.privacyHoldHint()}
      </p>
      {person ? null : (
        <ComboboxField
          label={m.privacyPerson()}
          options={hits.map((hit) => ({
            value: hit.id,
            label: displayName(hit),
          }))}
          value={picked ? [picked] : []}
          onChange={(next) => setPicked(next[0] ?? "")}
          search={search}
          onSearchChange={setSearch}
          errors={tried && !picked ? [m.validationSelection()] : undefined}
        />
      )}
      <FormField
        id="hold-reason"
        label={m.privacyHoldReason()}
        hint={m.privacyHoldReasonHint()}
        errors={
          tried && !reason.trim() ? [m.privacyHoldReasonNeeded()] : undefined
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

export interface ReleaseSheetProps {
  open: boolean;
  hold: HoldRow;
  onClose: () => void;
}

export function ReleaseSheet({ open, hold, onClose }: ReleaseSheetProps) {
  const refresh = useRefresh();
  const mutation = useMutation({
    mutationFn: () => releaseHold({ data: { id: hold.id } }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={m.privacyReleaseTitle({ name: displayName(hold) })}
      submitLabel={m.privacyReleaseHold()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        await mutation.mutateAsync().then(
          async () => {
            await refresh();
            toast.success(m.privacyHoldReleased());
            onClose();
          },
          () => undefined,
        );
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {m.privacyReleaseHint()}
      </p>
      <Facts>
        <Fact label={m.privacyHoldReason()} wide>
          {hold.reason}
        </Fact>
      </Facts>
    </SheetForm>
  );
}
