import type { StudentRetention } from "@faridalms/domain/privacy";

import { Button } from "@faridalms/ui/button";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Lock, LockOpen, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Column, RowAction } from "~/components/system/DataTable";
import type { Tone } from "~/components/system/status";
import type { getPrivacyOverview } from "~/server/privacy";

import { formatStamp } from "~/components/coursework/format";
import { sessionName } from "~/components/exams/names";
import { displayName } from "~/components/people/format";
import { ComboboxField } from "~/components/system/ComboboxField";
import { DataTable } from "~/components/system/DataTable";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { Fact, Facts, RecordSection } from "~/components/system/RecordPage";
import { SheetForm } from "~/components/system/SheetForm";
import { StatusText } from "~/components/system/status";
import { UserText } from "~/components/system/UserText";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { searchPeople } from "~/server/households";
import { placeHold, releaseHold, saveRetention } from "~/server/privacy";
import { formatDate, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

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
): { tone: Tone; label: string } {
  if (row.block?.kind === "hold")
    return { tone: "info", label: m.privacyOnHold() };
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
};

function reviewColumns(today: string): Column<ReviewRow>[] {
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
      cell: (row) => <StandingStatus row={row} today={today} />,
    },
  ];
}

function StandingStatus({ row, today }: { row: ReviewRow; today: string }) {
  const { tone, label } = standing(row, today);
  return <StatusText tone={tone}>{label}</StatusText>;
}

function PersonName({
  row,
}: {
  row: { fullNameEn: string | null; fullNameAr: string | null };
}) {
  return (
    <span className="truncate font-medium" dir="auto">
      {displayName(row)}
    </span>
  );
}

function reviewCard(today: string) {
  return {
    title: (row: ReviewRow) => <PersonName row={row} />,
    status: (row: ReviewRow) => <StandingStatus row={row} today={today} />,
    fact: (row: ReviewRow) =>
      m.privacyLeftFact({
        kind: KIND_LABEL[row.kind](),
        date: formatDate(row.leftOn),
      }),
  };
}

function holdColumns(timeZone: string): Column<HoldRow>[] {
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
          date: formatStamp(row.placedAt, timeZone),
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

export function ReviewTable({
  overview,
  onHold,
  onRelease,
  onRules,
}: {
  overview: PrivacyOverview;
  onHold: (row: ReviewRow) => void;
  onRelease: (hold: HoldRow) => void;
  onRules: () => void;
}) {
  const holdOf = new Map(overview.holds.map((row) => [row.subjectUserId, row]));
  const rowActions = (row: ReviewRow): RowAction[] => {
    const hold = holdOf.get(row.userId);
    return [
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
    overview.rules.studentRule === null && overview.rules.staffYears === null;
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
      <DataTable
        caption={m.privacyReviewCaption()}
        rows={reviewOrder(overview.review)}
        columns={reviewColumns(overview.today)}
        rowLabel={displayName}
        rowActions={rowActions}
        card={reviewCard(overview.today)}
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
    </div>
  );
}

export function HoldsTable({
  overview,
  onAdd,
  onRelease,
}: {
  overview: PrivacyOverview;
  onAdd: () => void;
  onRelease: (hold: HoldRow) => void;
}) {
  const user = useCurrentUser();
  return (
    <DataTable
      caption={m.privacyHoldsCaption()}
      rows={overview.holds}
      columns={holdColumns(user.school.timeZone)}
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

export function RetentionSection({
  rules,
  onEdit,
}: {
  rules: Rules;
  onEdit: () => void;
}) {
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
      </Facts>
    </RecordSection>
  );
}

const KEEP = "keep";

export function RetentionSheet({
  open,
  rules,
  onClose,
}: {
  open: boolean;
  rules: Rules;
  onClose: () => void;
}) {
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
  const mutation = useMutation({
    mutationFn: () =>
      saveRetention({
        data: {
          studentRule: rule === KEEP ? null : rule,
          studentValue,
          staffYears,
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
        if (valueError || staffError) return;
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
    </SheetForm>
  );
}

/** A hold on someone named already, or on a person searched for. */
export function HoldSheet({
  open,
  person,
  onClose,
}: {
  open: boolean;
  person: { id: string; name: string } | null;
  onClose: () => void;
}) {
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

export function ReleaseSheet({
  open,
  hold,
  onClose,
}: {
  open: boolean;
  hold: HoldRow;
  onClose: () => void;
}) {
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
