import type { GradeBand, GradeDisplay } from "@faridalms/domain/grading";
import type { GridColumn, GridIssue } from "@faridalms/ui/system/data-grid";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";

import { Button } from "@faridalms/ui/button";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import {
  DataGrid,
  GridAddButton,
  GridRemoveButton,
  NumberCell,
  TextCell,
  useFocusAfterRender,
} from "@faridalms/ui/system/data-grid";
import { DataTable } from "@faridalms/ui/system/data-table";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Pencil, Plus, Scale, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { getGradingOverview } from "~/server/grading";

import { CheckboxRow } from "~/components/people/fields";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  retireGradeScale,
  saveGradeBands,
  saveGradeScale,
} from "~/server/grading";
import { formatDate, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { bandsLine } from "./format";

export type GradingOverview = Awaited<ReturnType<typeof getGradingOverview>>;
export type ScaleRow = GradingOverview["scales"][number];

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["grading"] });
}

const scaleTitle = (row: { titleEn: string | null; titleAr: string | null }) =>
  inLocale(row.titleEn, row.titleAr);

const DISPLAY_LABEL: Record<GradeDisplay, () => string> = {
  grade: m.gradingDisplayGrade,
  grade_score: m.gradingDisplayGradeScore,
};

function scaleColumns(): Column<ScaleRow>[] {
  return [
    {
      id: "name",
      header: m.gradingScale(),
      primary: true,
      cell: (row) => (
        <span className="grid gap-0.5">
          <span className="truncate font-medium" dir="auto">
            {scaleTitle(row)}
          </span>
          <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
            {row.versions[0] ? bandsLine(row.versions[0].bands) : ""}
          </span>
        </span>
      ),
    },
    {
      id: "display",
      header: m.gradingDisplay(),
      cell: (row) => DISPLAY_LABEL[row.display](),
    },
    {
      id: "since",
      header: m.gradingBandsSince(),
      cell: (row) =>
        row.versions[0] ? formatDate(row.versions[0].effectiveFrom) : "",
    },
  ];
}

const scaleCard = {
  title: (row: ScaleRow) => (
    <span className="font-medium" dir="auto">
      {scaleTitle(row)}
    </span>
  ),
  fact: (row: ScaleRow) =>
    row.versions[0] ? bandsLine(row.versions[0].bands) : "",
};

export interface ScalesTableProps {
  overview: GradingOverview;
  onAdd: () => void;
  onRename: (row: ScaleRow) => void;
  onBands: (row: ScaleRow) => void;
  onRetire: (row: ScaleRow) => void;
}

export function ScalesTable({
  overview,
  onAdd,
  onRename,
  onBands,
  onRetire,
}: ScalesTableProps) {
  const rowActions = (row: ScaleRow): RowAction[] => [
    {
      label: m.gradingChangeBands(),
      icon: SlidersHorizontal,
      onSelect: () => onBands(row),
    },
    {
      label: m.gradingRenameScale(),
      icon: Pencil,
      onSelect: () => onRename(row),
    },
    {
      label: m.gradingRetireScale(),
      icon: Archive,
      onSelect: () => onRetire(row),
    },
  ];
  return (
    <DataTable
      caption={m.gradingScalesCaption()}
      rows={overview.scales}
      columns={scaleColumns()}
      rowLabel={scaleTitle}
      rowActions={rowActions}
      card={scaleCard}
      empty={{
        icon: Scale,
        title: m.gradingScalesEmpty(),
        description: m.gradingScalesEmptyHint(),
        action: (
          <Button type="button" className="max-md:h-10" onClick={onAdd}>
            <Plus aria-hidden />
            {m.gradingAddScale()}
          </Button>
        ),
      }}
    />
  );
}

interface BandDraft {
  key: string;
  labelEn: string;
  labelAr: string;
  minPercent: number | null;
  gpa: number | null;
}

const draftOf = (band: GradeBand): BandDraft => ({
  key: crypto.randomUUID(),
  labelEn: band.labelEn,
  // A grade named alike in both languages, such as A*, leaves the Arabic
  // name empty and takes the English one when saved.
  labelAr: band.labelAr === band.labelEn ? "" : band.labelAr,
  minPercent: band.minPercent,
  gpa: band.gpa,
});

function bandsOf(drafts: readonly BandDraft[]): GradeBand[] {
  return drafts.map((draft) => ({
    labelEn: draft.labelEn.trim(),
    labelAr: draft.labelAr.trim() || draft.labelEn.trim(),
    minPercent: draft.minPercent ?? 0,
    gpa: draft.gpa,
  }));
}

const bandCell = (draft: BandDraft, field: "en" | "ar" | "from" | "gpa") =>
  `band-${draft.key}-${field}`;

/**
 * What stops the bands being saved, each tied to its cell: the schema's
 * own rules, said where the grade is rather than once for the list.
 */
function bandIssues(drafts: readonly BandDraft[]): GridIssue[] {
  const issues: GridIssue[] = [];
  const labels = new Set<string>();
  const bounds = new Set<number>();
  drafts.forEach((draft, index) => {
    const row = index + 1;
    const label = draft.labelEn.trim();
    if (!label)
      issues.push({
        target: bandCell(draft, "en"),
        message: m.gradingBandNameNeeded({ row }),
      });
    else if (labels.has(label))
      issues.push({
        target: bandCell(draft, "en"),
        message: m.gradingLabelRepeated(),
      });
    labels.add(label);
    const from = draft.minPercent;
    if (from === null || from > 100)
      issues.push({
        target: bandCell(draft, "from"),
        message: m.gradingBandFromNeeded({ row }),
      });
    else if (bounds.has(from))
      issues.push({
        target: bandCell(draft, "from"),
        message: m.gradingBoundRepeated(),
      });
    if (from !== null) bounds.add(from);
    if (draft.gpa !== null && draft.gpa > 5)
      issues.push({
        target: bandCell(draft, "gpa"),
        message: m.gradingBandGpaRange({ row }),
      });
  });
  const lowest = drafts.toSorted(
    (a, b) => (a.minPercent ?? 101) - (b.minPercent ?? 101),
  )[0];
  if (lowest && !bounds.has(0))
    issues.push({
      target: bandCell(lowest, "from"),
      message: m.gradingNoFloor(),
    });
  return issues;
}

/** The scores a band covers: from its lower bound to the next band's. */
function bandRange(drafts: readonly BandDraft[], draft: BandDraft) {
  const from = draft.minPercent;
  if (from === null || from > 100) return null;
  const next = drafts
    .flatMap((other) =>
      other.minPercent !== null && other.minPercent > from
        ? [other.minPercent]
        : [],
    )
    .toSorted((a, b) => a - b)[0];
  return next === undefined || next > 100
    ? m.gradingBandRangeTop({
        from: formatNumber(from),
        to: formatNumber(100),
      })
    : m.gradingBandRange({ from: formatNumber(from), to: formatNumber(next) });
}

interface BandGridOptions {
  bands: BandDraft[];
  withGpa: boolean;
  set: (key: string, change: Partial<BandDraft>) => void;
  remove: (key: string) => void;
}

// Built per render: headers read the request's locale.
function bandGrid({ bands, withGpa, set, remove }: BandGridOptions) {
  const row = (draft: BandDraft) => bands.indexOf(draft) + 1;
  const rowHeader = {
    header: m.gradingBandLabelEn(),
    cell: (draft: BandDraft) => (
      <TextCell
        id={bandCell(draft, "en")}
        label={m.gradingBandLabelEnRow({ row: row(draft) })}
        dir="ltr"
        maxLength={24}
        value={draft.labelEn}
        onChange={(labelEn) => set(draft.key, { labelEn })}
      />
    ),
  };
  const rowEnd = (draft: BandDraft) => (
    <GridRemoveButton
      label={m.gradingRemoveBand({ row: row(draft) })}
      disabled={bands.length <= 2}
      onRemove={() => remove(draft.key)}
    />
  );
  const columns: GridColumn<BandDraft>[] = [
    {
      id: "ar",
      header: m.gradingBandLabelAr(),
      cell: (draft) => (
        <TextCell
          id={bandCell(draft, "ar")}
          label={m.gradingBandLabelArRow({ row: row(draft) })}
          lang="ar"
          maxLength={24}
          placeholder={draft.labelEn}
          value={draft.labelAr}
          onChange={(labelAr) => set(draft.key, { labelAr })}
        />
      ),
    },
    {
      id: "from",
      header: m.gradingBandFromPercent(),
      numeric: true,
      cell: (draft) => (
        <NumberCell
          id={bandCell(draft, "from")}
          label={m.gradingBandFromRow({ row: row(draft) })}
          decimals={2}
          value={draft.minPercent}
          onChange={(minPercent) => set(draft.key, { minPercent })}
        />
      ),
    },
    {
      id: "covers",
      header: m.gradingBandCovers(),
      cell: (draft) => (
        <span className="text-[13px] leading-[18px] whitespace-nowrap text-muted-foreground tabular-nums">
          {bandRange(bands, draft) ?? "—"}
        </span>
      ),
    },
    ...(withGpa
      ? [
          {
            id: "gpa",
            header: m.gradingBandGpa(),
            numeric: true,
            cell: (draft: BandDraft) => (
              <NumberCell
                id={bandCell(draft, "gpa")}
                label={m.gradingBandGpaRow({ row: row(draft) })}
                decimals={2}
                value={draft.gpa}
                onChange={(gpa) => set(draft.key, { gpa })}
              />
            ),
          },
        ]
      : []),
  ];
  return { rowHeader, columns, rowEnd };
}

interface BandsEditorProps {
  value: BandDraft[];
  onChange: (value: BandDraft[]) => void;
  issues: GridIssue[];
}

/**
 * The bands of a scale, highest first, each a grade's names, lower bound
 * and GPA, with the scores each one covers worked out beside it.
 */
function BandsEditor({ value, onChange, issues }: BandsEditorProps) {
  const focusLater = useFocusAfterRender();
  const set = (key: string, change: Partial<BandDraft>) =>
    onChange(
      value.map((draft) =>
        draft.key === key ? { ...draft, ...change } : draft,
      ),
    );
  // GPA points matter to US-style scales only; elsewhere the column stays
  // away and leaves the room to the grades' names.
  const [withGpa, setWithGpa] = useState(() =>
    value.some((draft) => draft.gpa !== null),
  );
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="mb-1 text-sm leading-5 font-medium">
        {m.gradingBands()}
      </legend>
      <p className="-mt-1 text-[13px] leading-[18px] text-muted-foreground">
        {m.gradingBandsHint()}
      </p>
      <CheckboxRow
        label={m.gradingWithGpa()}
        checked={withGpa}
        onChange={(checked) => {
          setWithGpa(checked);
          if (!checked)
            onChange(value.map((draft) => ({ ...draft, gpa: null })));
        }}
      />
      <DataGrid<BandDraft>
        caption={m.gradingBandsTable()}
        editing
        surface="sheet"
        {...bandGrid({
          bands: value,
          withGpa,
          set,
          remove: (key) => onChange(value.filter((item) => item.key !== key)),
        })}
        groups={[{ id: "bands", title: "", rows: value }]}
        rowKey={(draft) => draft.key}
        issues={issues}
        footer={
          <GridAddButton
            label={m.gradingAddBand()}
            disabled={value.length >= 20}
            onAdd={() => {
              const added: BandDraft = {
                key: crypto.randomUUID(),
                labelEn: "",
                labelAr: "",
                minPercent: null,
                gpa: null,
              };
              onChange([...value, added]);
              focusLater(bandCell(added, "en"));
            }}
          />
        }
      />
    </fieldset>
  );
}

interface DisplayFieldProps {
  value: GradeDisplay;
  onChange: (value: GradeDisplay) => void;
}

function DisplayField({ value, onChange }: DisplayFieldProps) {
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-sm leading-5 font-medium">
        {m.gradingDisplay()}
      </legend>
      <RadioGroup
        value={value}
        onValueChange={(next) =>
          onChange(next === "grade_score" ? "grade_score" : "grade")
        }
      >
        <label className="flex items-center gap-3 text-sm leading-5">
          <RadioGroupItem value="grade" />
          {m.gradingDisplayGradeLong()}
        </label>
        <label className="flex items-center gap-3 text-sm leading-5">
          <RadioGroupItem value="grade_score" />
          {m.gradingDisplayGradeScoreLong()}
        </label>
      </RadioGroup>
    </fieldset>
  );
}

export interface ScaleSheetProps {
  open: boolean;
  scale?: ScaleRow;
  overview: GradingOverview;
  onClose: () => void;
}

/** Adds a scale from a preset the school then adjusts, or renames one. */
export function ScaleSheet({
  open,
  scale,
  overview,
  onClose,
}: ScaleSheetProps) {
  const refresh = useRefresh();
  const first = overview.presets[0];
  const [preset, setPreset] = useState(first?.key ?? "");
  const [titleEn, setTitleEn] = useState(
    scale?.titleEn ?? first?.titleEn ?? "",
  );
  const [titleAr, setTitleAr] = useState(
    scale?.titleAr ?? first?.titleAr ?? "",
  );
  const [display, setDisplay] = useState<GradeDisplay>(
    scale?.display ?? first?.display ?? "grade",
  );
  const [bands, setBands] = useState<BandDraft[]>(() =>
    (first?.bands ?? []).map(draftOf),
  );
  const [tried, setTried] = useState(false);
  const problems = scale ? [] : bandIssues(bands);
  const mutation = useMutation({
    mutationFn: () =>
      saveGradeScale({
        data: {
          ...(scale ? { id: scale.id } : { bands: bandsOf(bands) }),
          titleEn: titleEn.trim() || null,
          titleAr: titleAr.trim() || null,
          display,
        },
      }),
    meta: { inlineError: true },
  });
  const choose = (key: string) => {
    const found = overview.presets.find((row) => row.key === key);
    if (!found) return;
    setPreset(key);
    setTitleEn(found.titleEn);
    setTitleAr(found.titleAr);
    setDisplay(found.display);
    setBands(found.bands.map(draftOf));
  };
  const untitled = tried && !titleEn.trim() && !titleAr.trim();
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={scale ? m.gradingRenameScale() : m.gradingAddScale()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        setTried(true);
        if ((!titleEn.trim() && !titleAr.trim()) || problems.length) return;
        try {
          await mutation.mutateAsync();
        } catch {
          return;
        }
        await refresh();
        toast.success(m.managementSaved());
        onClose();
      }}
    >
      {scale ? null : (
        <SelectField
          id="grading-preset"
          label={m.gradingStartFrom()}
          hint={m.gradingStartFromHint()}
          value={preset}
          options={overview.presets.map((row) => ({
            value: row.key,
            label: inLocale(row.titleEn, row.titleAr),
          }))}
          onChange={choose}
        />
      )}
      <TextField
        id="grading-title-en"
        label={m.examTitleEn()}
        width="name"
        lang="en"
        autoComplete="off"
        value={titleEn}
        onChange={(event) => setTitleEn(event.target.value)}
        errors={untitled ? [m.examTitleNeeded()] : undefined}
      />
      <TextField
        id="grading-title-ar"
        label={m.examTitleAr()}
        width="name"
        lang="ar"
        dir="rtl"
        autoComplete="off"
        value={titleAr}
        onChange={(event) => setTitleAr(event.target.value)}
      />
      <DisplayField value={display} onChange={setDisplay} />
      {scale ? null : (
        <BandsEditor
          value={bands}
          onChange={setBands}
          issues={tried ? problems : []}
        />
      )}
    </SheetForm>
  );
}

export interface BandsSheetProps {
  open: boolean;
  scale: ScaleRow;
  today: string;
  onClose: () => void;
}

/**
 * New bands for a scale from a date, with the reason kept in the history.
 * Grades already given keep the bands they were given under.
 */
export function BandsSheet({ open, scale, today, onClose }: BandsSheetProps) {
  const refresh = useRefresh();
  const [bands, setBands] = useState<BandDraft[]>(() =>
    (scale.versions[0]?.bands ?? []).map(draftOf),
  );
  const [from, setFrom] = useState(today);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const problems = bandIssues(bands);
  const mutation = useMutation({
    mutationFn: () =>
      saveGradeBands({
        data: {
          scaleId: scale.id,
          effectiveFrom: from,
          bands: bandsOf(bands),
          reason: reason.trim(),
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={m.gradingChangeBands()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        setTried(true);
        if (problems.length || !reason.trim() || !from) return;
        try {
          await mutation.mutateAsync();
        } catch {
          return;
        }
        await refresh();
        toast.success(m.managementSaved());
        onClose();
      }}
    >
      <p className="text-sm leading-5 font-medium" dir="auto">
        {scaleTitle(scale)}
      </p>
      <p className="text-sm leading-5 text-muted-foreground">
        {m.gradingBandsKeepHint()}
      </p>
      <TextField
        id="grading-from"
        label={m.gradingEffectiveFrom()}
        type="date"
        width="date"
        value={from}
        onChange={(event) => setFrom(event.target.value)}
        errors={tried && !from ? [m.examMonthNeeded()] : undefined}
      />
      <BandsEditor
        value={bands}
        onChange={setBands}
        issues={tried ? problems : []}
      />
      <FormField
        id="grading-reason"
        label={m.examReason()}
        hint={m.examReasonHint()}
        errors={tried && !reason.trim() ? [m.examReasonNeeded()] : undefined}
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}

export interface RetireScaleSheetProps {
  open: boolean;
  scale: ScaleRow;
  onClose: () => void;
}

export function RetireScaleSheet({
  open,
  scale,
  onClose,
}: RetireScaleSheetProps) {
  const refresh = useRefresh();
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      retireGradeScale({ data: { id: scale.id, reason: reason.trim() } }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={m.gradingRetireScale()}
      submitLabel={m.examRetire()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        setTried(true);
        if (!reason.trim()) return;
        try {
          await mutation.mutateAsync();
        } catch {
          return;
        }
        await refresh();
        toast.success(m.gradingScaleRetired());
        onClose();
      }}
    >
      <p className="text-sm leading-5 font-medium" dir="auto">
        {scaleTitle(scale)}
      </p>
      <p className="text-sm leading-5 text-muted-foreground">
        {m.gradingRetireHint()}
      </p>
      <FormField
        id="grading-retire-reason"
        label={m.examReason()}
        errors={tried && !reason.trim() ? [m.examReasonNeeded()] : undefined}
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}
