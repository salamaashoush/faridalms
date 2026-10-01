import type { GradeBand, GradeDisplay } from "@faridalms/domain/grading";

import { bandsSchema } from "@faridalms/domain/grading";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Pencil,
  Plus,
  Scale,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import type { Column, RowAction } from "~/components/system/DataTable";
import type { getGradingOverview } from "~/server/grading";

import { CheckboxRow } from "~/components/people/fields";
import { DataTable } from "~/components/system/DataTable";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { SheetForm } from "~/components/system/SheetForm";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  retireGradeScale,
  saveGradeBands,
  saveGradeScale,
} from "~/server/grading";
import { formatDate } from "~/utils/datetime";
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

export function ScalesTable({
  overview,
  onAdd,
  onRename,
  onBands,
  onRetire,
}: {
  overview: GradingOverview;
  onAdd: () => void;
  onRename: (row: ScaleRow) => void;
  onBands: (row: ScaleRow) => void;
  onRetire: (row: ScaleRow) => void;
}) {
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
  minPercent: string;
  gpa: string;
}

const draftOf = (band: GradeBand): BandDraft => ({
  key: crypto.randomUUID(),
  labelEn: band.labelEn,
  // A grade named alike in both languages, such as A*, leaves the Arabic
  // name empty and takes the English one when saved.
  labelAr: band.labelAr === band.labelEn ? "" : band.labelAr,
  minPercent: String(band.minPercent),
  gpa: band.gpa === null ? "" : String(band.gpa),
});

function bandsOf(drafts: readonly BandDraft[]): GradeBand[] {
  return drafts.map((draft) => ({
    labelEn: draft.labelEn.trim(),
    labelAr: draft.labelAr.trim() || draft.labelEn.trim(),
    minPercent: Number(draft.minPercent),
    gpa: draft.gpa.trim() === "" ? null : Number(draft.gpa),
  }));
}

const BAND_PROBLEM: Record<string, () => string> = {
  "grading.label_repeated": m.gradingLabelRepeated,
  "grading.bound_repeated": m.gradingBoundRepeated,
  "grading.no_floor": m.gradingNoFloor,
};

/** Why bands cannot be saved as they are, said in the reader's words. */
function bandsProblem(drafts: readonly BandDraft[]): string | null {
  if (
    drafts.some(
      (draft) =>
        !draft.labelEn.trim() ||
        draft.minPercent.trim() === "" ||
        Number.isNaN(Number(draft.minPercent)),
    )
  )
    return m.gradingBandIncomplete();
  const checked = v.safeParse(bandsSchema, bandsOf(drafts));
  if (checked.success) return null;
  const [issue] = checked.issues;
  return (BAND_PROBLEM[issue.message] ?? m.gradingBandIncomplete)();
}

/** The bands of a scale, highest first, each a grade's names, lower bound and GPA. */
function BandsEditor({
  value,
  onChange,
  problem,
}: {
  value: BandDraft[];
  onChange: (value: BandDraft[]) => void;
  problem: string | null;
}) {
  const set = (key: string, change: Partial<BandDraft>) =>
    onChange(
      value.map((draft) =>
        draft.key === key ? { ...draft, ...change } : draft,
      ),
    );
  const cell = "h-9 min-w-0 px-2 max-md:h-10";
  // GPA points matter to US-style scales only; elsewhere the column stays
  // away and leaves the room to the grades' names.
  const [withGpa, setWithGpa] = useState(() =>
    value.some((draft) => draft.gpa.trim() !== ""),
  );
  const columns = withGpa
    ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4rem_3.5rem_2rem]"
    : "grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4rem_2rem]";
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm leading-5 font-medium">
        {m.gradingBands()}
      </legend>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.gradingBandsHint()}
      </p>
      <CheckboxRow
        label={m.gradingWithGpa()}
        checked={withGpa}
        onChange={(checked) => {
          setWithGpa(checked);
          if (!checked) onChange(value.map((draft) => ({ ...draft, gpa: "" })));
        }}
      />
      <div
        aria-hidden
        className={`grid ${columns} gap-2 text-xs text-muted-foreground`}
      >
        <span>{m.gradingBandLabelEn()}</span>
        <span>{m.gradingBandLabelAr()}</span>
        <span>{m.gradingBandFromPercent()}</span>
        {withGpa ? <span>{m.gradingBandGpa()}</span> : null}
      </div>
      {value.map((draft, index) => (
        <div key={draft.key} className={`grid ${columns} items-center gap-2`}>
          <Input
            aria-label={m.gradingBandLabelEnRow({ row: index + 1 })}
            dir="ltr"
            maxLength={24}
            value={draft.labelEn}
            onChange={(event) =>
              set(draft.key, { labelEn: event.target.value })
            }
            className={cell}
          />
          <Input
            aria-label={m.gradingBandLabelArRow({ row: index + 1 })}
            dir="auto"
            lang="ar"
            maxLength={24}
            value={draft.labelAr}
            placeholder={draft.labelEn}
            onChange={(event) =>
              set(draft.key, { labelAr: event.target.value })
            }
            className={cell}
          />
          <Input
            aria-label={m.gradingBandFromRow({ row: index + 1 })}
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="any"
            value={draft.minPercent}
            onChange={(event) =>
              set(draft.key, { minPercent: event.target.value })
            }
            className={cell}
          />
          {withGpa ? (
            <Input
              aria-label={m.gradingBandGpaRow({ row: index + 1 })}
              type="number"
              inputMode="decimal"
              min={0}
              max={5}
              step="any"
              value={draft.gpa}
              onChange={(event) => set(draft.key, { gpa: event.target.value })}
              className={cell}
            />
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.gradingRemoveBand({ row: index + 1 })}
            disabled={value.length <= 2}
            onClick={() =>
              onChange(value.filter((item) => item.key !== draft.key))
            }
            className="max-md:size-10"
          >
            <X aria-hidden />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-self-start max-md:h-10"
        disabled={value.length >= 20}
        onClick={() =>
          onChange([
            ...value,
            {
              key: crypto.randomUUID(),
              labelEn: "",
              labelAr: "",
              minPercent: "",
              gpa: "",
            },
          ])
        }
      >
        <Plus aria-hidden />
        {m.gradingAddBand()}
      </Button>
      {problem ? (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {problem}
        </p>
      ) : null}
    </fieldset>
  );
}

function DisplayField({
  value,
  onChange,
}: {
  value: GradeDisplay;
  onChange: (value: GradeDisplay) => void;
}) {
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

/** Adds a scale from a preset the school then adjusts, or renames one. */
export function ScaleSheet({
  open,
  scale,
  overview,
  onClose,
}: {
  open: boolean;
  scale?: ScaleRow;
  overview: GradingOverview;
  onClose: () => void;
}) {
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
  const problem = scale ? null : bandsProblem(bands);
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
        if ((!titleEn.trim() && !titleAr.trim()) || problem) return;
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
          problem={tried ? problem : null}
        />
      )}
    </SheetForm>
  );
}

/**
 * New bands for a scale from a date, with the reason kept in the history.
 * Grades already given keep the bands they were given under.
 */
export function BandsSheet({
  open,
  scale,
  today,
  onClose,
}: {
  open: boolean;
  scale: ScaleRow;
  today: string;
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const [bands, setBands] = useState<BandDraft[]>(() =>
    (scale.versions[0]?.bands ?? []).map(draftOf),
  );
  const [from, setFrom] = useState(today);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const problem = bandsProblem(bands);
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
        if (problem || !reason.trim() || !from) return;
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
        problem={tried ? problem : null}
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

export function RetireScaleSheet({
  open,
  scale,
  onClose,
}: {
  open: boolean;
  scale: ScaleRow;
  onClose: () => void;
}) {
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
