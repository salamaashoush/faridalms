import type { GradeBand, GradeDisplay } from "@faridalms/domain/grading";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type { ReactNode } from "react";

import { Button } from "@faridalms/ui/button";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import { DataTable, RowButton } from "@faridalms/ui/system/data-table";
import {
  FormField,
  NumberField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { SheetPanel } from "@faridalms/ui/system/sheet-panel";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, Pencil, Plus, Scale, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { getGradingOverview } from "~/server/grading";
import type { InWords } from "~/utils/words";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import {
  retireGradeScale,
  saveGradeBands,
  saveGradeScale,
} from "~/server/grading";
import { formatDate, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { useWords } from "~/utils/words";

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

/** The most grades a scale holds, as the domain allows. */
const MOST_BANDS = 20;

type ScaleOpener = (row: ScaleRow, text: ReactNode) => ReactNode;

function scaleColumns(opener: ScaleOpener, words: InWords): Column<ScaleRow>[] {
  return [
    {
      id: "name",
      header: m.gradingScale(),
      primary: true,
      cell: (row) => (
        <span className="grid gap-0.5">
          {opener(row, scaleTitle(row))}
          <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
            {row.versions[0] ? bandsLine(row.versions[0].bands) : ""}
          </span>
        </span>
      ),
    },
    {
      id: "display",
      header: words(m.gradingDisplayCore)(),
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

function scaleCard(opener: ScaleOpener) {
  return {
    title: (row: ScaleRow) => opener(row, scaleTitle(row)),
    fact: (row: ScaleRow) =>
      row.versions[0] ? bandsLine(row.versions[0].bands) : "",
  };
}

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
  const words = useWords();
  const rowActions = (row: ScaleRow): RowAction[] => [
    {
      label: m.gradingChangeBands(),
      icon: Pencil,
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
  const opener: ScaleOpener = (row, text) => (
    <RowButton onClick={() => onBands(row)}>{text}</RowButton>
  );
  return (
    <DataTable
      caption={m.gradingScalesCaption()}
      rows={overview.scales}
      columns={scaleColumns(opener, words)}
      rowLabel={scaleTitle}
      rowActions={rowActions}
      card={scaleCard(opener)}
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

const draftOf = (
  band: GradeBand,
  key: string = crypto.randomUUID(),
): BandDraft => ({
  key,
  labelEn: band.labelEn,
  // A grade named alike in both languages, such as A*, leaves the Arabic
  // name empty and takes the English one when saved.
  labelAr: band.labelAr === band.labelEn ? "" : band.labelAr,
  minPercent: band.minPercent,
  gpa: band.gpa,
});

const highestFirst = (drafts: readonly BandDraft[]) =>
  drafts.toSorted((a, b) => (b.minPercent ?? -1) - (a.minPercent ?? -1));

function bandsOf(drafts: readonly BandDraft[]): GradeBand[] {
  return highestFirst(drafts).map((draft) => ({
    labelEn: draft.labelEn.trim(),
    labelAr: draft.labelAr.trim() || draft.labelEn.trim(),
    minPercent: draft.minPercent ?? 0,
    gpa: draft.gpa,
  }));
}

const bandName = (draft: BandDraft) =>
  inLocale(draft.labelEn.trim() || null, draft.labelAr.trim() || null);

type BandField = "en" | "from" | "gpa";

/**
 * What stops one grade being kept beside the others: the scale's own rules
 * (names and lower bounds each used once, one grade from 0), said on the
 * field that breaks them.
 */
function bandProblems(
  draft: BandDraft,
  others: readonly BandDraft[],
): Partial<Record<BandField, string>> {
  const problems: Partial<Record<BandField, string>> = {};
  const label = draft.labelEn.trim();
  if (!label) problems.en = m.gradingBandNameNeededOne();
  else if (others.some((other) => other.labelEn.trim() === label))
    problems.en = m.gradingLabelRepeated();
  const from = draft.minPercent;
  if (from === null || from > 100) problems.from = m.gradingBandFromNeededOne();
  else if (others.some((other) => other.minPercent === from))
    problems.from = m.gradingBoundRepeated();
  else if (from !== 0 && !others.some((other) => other.minPercent === 0))
    problems.from = m.gradingNoFloor();
  if (draft.gpa !== null && draft.gpa > 5)
    problems.gpa = m.gradingBandGpaRangeOne();
  return problems;
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

type BandOpener = (draft: BandDraft, text: string) => ReactNode;

// Built per render: headers read the request's locale.
function bandColumns(
  bands: readonly BandDraft[],
  opener: BandOpener,
): Column<BandDraft & { id: string }>[] {
  const withGpa = bands.some((draft) => draft.gpa !== null);
  return [
    {
      id: "en",
      header: m.gradingBandLabelEn(),
      primary: true,
      cell: (draft) => opener(draft, draft.labelEn),
    },
    {
      id: "ar",
      header: m.gradingBandLabelAr(),
      cell: (draft) =>
        draft.labelAr ? (
          <span lang="ar" dir="rtl">
            {draft.labelAr}
          </span>
        ) : (
          <bdi dir="ltr">{draft.labelEn}</bdi>
        ),
    },
    {
      id: "from",
      header: m.gradingBandFromPercent(),
      align: "end",
      cell: (draft) =>
        draft.minPercent === null ? "" : formatNumber(draft.minPercent),
    },
    {
      id: "covers",
      header: m.gradingBandCovers(),
      cell: (draft) => (
        <span className="text-muted-foreground tabular-nums">
          {bandRange(bands, draft)}
        </span>
      ),
    },
    ...(withGpa
      ? [
          {
            id: "gpa",
            header: m.gradingBandGpa(),
            align: "end" as const,
            cell: (draft: BandDraft) =>
              draft.gpa === null ? "" : formatNumber(draft.gpa),
          },
        ]
      : []),
  ];
}

function bandCard(bands: readonly BandDraft[], opener: BandOpener) {
  return {
    title: (draft: BandDraft) => opener(draft, bandName(draft)),
    fact: (draft: BandDraft) => bandRange(bands, draft) ?? "",
  };
}

interface BandsTableProps {
  bands: BandDraft[];
  onEdit: (draft: BandDraft) => void;
  onRemove: (draft: BandDraft) => void;
  onAdd: () => void;
}

/**
 * A scale's grades, highest first, each with the scores it covers worked
 * out from the grade above it. Each grade opens on its own.
 */
function BandsTable({ bands, onEdit, onRemove, onAdd }: BandsTableProps) {
  const sorted = highestFirst(bands).map((draft) =>
    Object.assign({ id: draft.key }, draft),
  );
  const opener: BandOpener = (draft, text) => (
    <RowButton onClick={() => onEdit(draft)}>{text}</RowButton>
  );
  const add =
    bands.length < MOST_BANDS ? (
      <Button
        type="button"
        variant="outline"
        className="max-md:h-10"
        onClick={onAdd}
      >
        <Plus aria-hidden />
        {m.gradingAddBand()}
      </Button>
    ) : undefined;
  return (
    <DataTable
      caption={m.gradingBandsTable()}
      rows={sorted}
      columns={bandColumns(bands, opener)}
      rowLabel={bandName}
      rowActions={(draft) => [
        {
          label: m.recordEdit(),
          icon: Pencil,
          onSelect: () => onEdit(draft),
        },
        ...(bands.length > 2
          ? [
              {
                label: m.gradingBandRemove(),
                icon: Trash2,
                onSelect: () => onRemove(draft),
              },
            ]
          : []),
      ]}
      actions={add}
      card={bandCard(bands, opener)}
      empty={{ title: m.gradingBandsNone(), action: add }}
    />
  );
}

/**
 * Where a change to the grades goes: into a new scale's grades before it
 * is added, or saved at once as the scale's grades from a date, with why.
 */
type BandTarget =
  | { kind: "draft"; onDone: (bands: BandDraft[]) => void }
  | { kind: "saved"; scaleId: string; today: string };

interface DatedFieldsProps {
  from: string;
  reason: string;
  tried: boolean;
  onFrom: (from: string) => void;
  onReason: (reason: string) => void;
}

/** When saved grades take effect and why, kept in the history. */
function DatedFields({
  from,
  reason,
  tried,
  onFrom,
  onReason,
}: DatedFieldsProps) {
  return (
    <>
      <TextField
        id="grading-from"
        label={m.gradingEffectiveFrom()}
        hint={m.gradingBandsFromHint()}
        type="date"
        width="date"
        value={from}
        onChange={(event) => onFrom(event.target.value)}
        errors={tried && !from ? [m.gradingMonthNeeded()] : undefined}
      />
      <FormField
        id="grading-reason"
        label={m.gradingReason()}
        hint={m.gradingReasonHint()}
        errors={tried && !reason.trim() ? [m.gradingReasonNeeded()] : undefined}
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => onReason(event.target.value)}
          />
        )}
      </FormField>
    </>
  );
}

function useBandSave(target: BandTarget) {
  const refresh = useRefresh();
  const [from, setFrom] = useState(target.kind === "saved" ? target.today : "");
  const [reason, setReason] = useState("");
  const mutation = useMutation({
    mutationFn: (bands: BandDraft[]) =>
      target.kind === "saved"
        ? saveGradeBands({
            data: {
              scaleId: target.scaleId,
              effectiveFrom: from,
              bands: bandsOf(bands),
              reason: reason.trim(),
            },
          })
        : Promise.resolve(null),
    meta: { inlineError: true },
  });
  const dated = target.kind === "saved";
  return {
    dated,
    from,
    reason,
    setFrom,
    setReason,
    mutation,
    missing: dated && (!from || !reason.trim()),
    /** Keeps the grades, saying so when they were saved; false when the save failed. */
    keep: async (bands: BandDraft[]) => {
      if (target.kind === "draft") {
        target.onDone(bands);
        return true;
      }
      try {
        await mutation.mutateAsync(bands);
      } catch {
        return false;
      }
      await refresh();
      toast.success(m.managementSaved());
      return true;
    },
  };
}

interface BandSheetProps {
  bands: BandDraft[];
  /** The grade being changed; none to add one. */
  band: BandDraft | null;
  target: BandTarget;
  open: boolean;
  onClose: () => void;
}

/** One grade of a scale: its names, the score it starts at and its GPA. */
function BandSheet({ bands, band, target, open, onClose }: BandSheetProps) {
  const [draft, setDraft] = useState<BandDraft>(
    () =>
      band ?? {
        key: crypto.randomUUID(),
        labelEn: "",
        labelAr: "",
        minPercent: null,
        gpa: null,
      },
  );
  const [tried, setTried] = useState(false);
  const save = useBandSave(target);
  const others = bands.filter((other) => other.key !== draft.key);
  const problems = tried ? bandProblems(draft, others) : {};
  const set = (change: Partial<BandDraft>) =>
    setDraft((current) => ({ ...current, ...change }));
  const covers = bandRange([...others, draft], draft);
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        band ? m.gradingBandEdit({ grade: bandName(band) }) : m.gradingAddBand()
      }
      submitLabel={band ? m.gradingBandSave() : m.gradingAddBand()}
      pending={save.mutation.isPending}
      error={
        save.mutation.error ? getMessageFromError(save.mutation.error) : null
      }
      onSubmit={async () => {
        setTried(true);
        if (Object.keys(bandProblems(draft, others)).length || save.missing)
          return;
        if (await save.keep([...others, draft])) onClose();
      }}
    >
      <TextField
        id="band-name-en"
        label={m.gradingBandLabelEn()}
        width="code"
        dir="ltr"
        maxLength={24}
        autoComplete="off"
        value={draft.labelEn}
        onChange={(event) => set({ labelEn: event.target.value })}
        errors={problems.en ? [problems.en] : undefined}
      />
      <TextField
        id="band-name-ar"
        label={m.gradingBandLabelArName()}
        hint={m.gradingBandLabelArHint()}
        optional
        width="code"
        lang="ar"
        dir="rtl"
        maxLength={24}
        autoComplete="off"
        value={draft.labelAr}
        onChange={(event) => set({ labelAr: event.target.value })}
      />
      <NumberField
        id="band-from"
        label={m.gradingBandFromLabel()}
        hint={
          covers
            ? m.gradingBandCoversHint({ range: covers })
            : m.gradingBandsHint()
        }
        decimals={2}
        value={draft.minPercent}
        onChange={(minPercent) => set({ minPercent })}
        errors={problems.from ? [problems.from] : undefined}
      />
      <NumberField
        id="band-gpa"
        label={m.gradingBandGpa()}
        hint={m.gradingBandGpaHint()}
        optional
        decimals={2}
        value={draft.gpa}
        onChange={(gpa) => set({ gpa })}
        errors={problems.gpa ? [problems.gpa] : undefined}
      />
      {save.dated ? (
        <DatedFields
          from={save.from}
          reason={save.reason}
          tried={tried}
          onFrom={save.setFrom}
          onReason={save.setReason}
        />
      ) : null}
    </SheetForm>
  );
}

interface RemoveBandSheetProps {
  bands: BandDraft[];
  band: BandDraft;
  target: BandTarget;
  open: boolean;
  onClose: () => void;
}

/**
 * Takes a grade out of a scale. Scores it covered fall to the grade below
 * it, so the scale keeps a grade from 0 and at least two grades.
 */
function RemoveBandSheet({
  bands,
  band,
  target,
  open,
  onClose,
}: RemoveBandSheetProps) {
  const [tried, setTried] = useState(false);
  const save = useBandSave(target);
  const rest = bands.filter((other) => other.key !== band.key);
  const floorless = !rest.some((other) => other.minPercent === 0);
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={m.gradingBandRemoveTitle({ grade: bandName(band) })}
      submitLabel={m.gradingBandRemove()}
      destructive
      pending={save.mutation.isPending}
      error={
        tried && floorless
          ? m.gradingNoFloor()
          : save.mutation.error
            ? getMessageFromError(save.mutation.error)
            : null
      }
      onSubmit={async () => {
        setTried(true);
        if (floorless || save.missing) return;
        if (await save.keep(rest)) onClose();
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {m.gradingBandRemoveBody()}
      </p>
      {save.dated ? (
        <DatedFields
          from={save.from}
          reason={save.reason}
          tried={tried}
          onFrom={save.setFrom}
          onReason={save.setReason}
        />
      ) : null}
    </SheetForm>
  );
}

interface BandEditing {
  band: BandDraft | null;
  removing: boolean;
  key: number;
  open: boolean;
}

/** Which grade's sheet is open, kept while it animates closed. */
function useBandEditing() {
  const [editing, setEditing] = useState<BandEditing | null>(null);
  return {
    editing,
    open: (band: BandDraft | null, removing = false) =>
      setEditing((current) => ({
        band,
        removing,
        key: (current?.key ?? 0) + 1,
        open: true,
      })),
    close: () =>
      setEditing((current) => current && { ...current, open: false }),
  };
}

interface BandSheetsProps {
  bands: BandDraft[];
  target: BandTarget;
  editing: BandEditing | null;
  onClose: () => void;
}

function BandSheets({ bands, target, editing, onClose }: BandSheetsProps) {
  if (!editing) return null;
  if (editing.removing && editing.band)
    return (
      <RemoveBandSheet
        key={editing.key}
        bands={bands}
        band={editing.band}
        target={target}
        open={editing.open}
        onClose={onClose}
      />
    );
  return (
    <BandSheet
      key={editing.key}
      bands={bands}
      band={editing.band}
      target={target}
      open={editing.open}
      onClose={onClose}
    />
  );
}

interface DisplayFieldProps {
  value: GradeDisplay;
  onChange: (value: GradeDisplay) => void;
}

function DisplayField({ value, onChange }: DisplayFieldProps) {
  const words = useWords();
  return (
    <fieldset className="grid gap-3">
      <legend className="mb-2 text-sm leading-5 font-medium">
        {words(m.gradingDisplayCore)()}
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

/** What stops a new scale's grades being saved as a whole. */
function scaleProblem(bands: readonly BandDraft[]): string | null {
  if (bands.length < 2) return m.gradingBandsTooFew();
  if (!bands.some((band) => band.minPercent === 0)) return m.gradingNoFloor();
  return null;
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
    (first?.bands ?? []).map((band) => draftOf(band)),
  );
  const [tried, setTried] = useState(false);
  const band = useBandEditing();
  const problem = scale ? null : scaleProblem(bands);
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
    setBands(found.bands.map((given) => draftOf(given)));
  };
  const untitled = tried && !titleEn.trim() && !titleAr.trim();
  return (
    <>
      <SheetForm
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        title={scale ? m.gradingRenameScale() : m.gradingAddScale()}
        pending={mutation.isPending}
        error={
          mutation.error
            ? getMessageFromError(mutation.error)
            : tried
              ? problem
              : null
        }
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
          label={m.gradingTitleEn()}
          width="name"
          lang="en"
          autoComplete="off"
          value={titleEn}
          onChange={(event) => setTitleEn(event.target.value)}
          errors={untitled ? [m.gradingTitleNeeded()] : undefined}
        />
        <TextField
          id="grading-title-ar"
          label={m.gradingTitleAr()}
          width="name"
          lang="ar"
          dir="rtl"
          autoComplete="off"
          value={titleAr}
          onChange={(event) => setTitleAr(event.target.value)}
        />
        <DisplayField value={display} onChange={setDisplay} />
        {scale ? null : (
          <section aria-labelledby="grading-bands" className="grid gap-2">
            <h3 id="grading-bands" className="text-sm leading-5 font-medium">
              {m.gradingBands()}
            </h3>
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {m.gradingBandsHint()}
            </p>
            <BandsTable
              bands={bands}
              onEdit={(draft) => band.open(draft)}
              onRemove={(draft) => band.open(draft, true)}
              onAdd={() => band.open(null)}
            />
          </section>
        )}
      </SheetForm>
      <BandSheets
        bands={bands}
        target={{ kind: "draft", onDone: setBands }}
        editing={band.editing}
        onClose={band.close}
      />
    </>
  );
}

export interface BandsSheetProps {
  open: boolean;
  scale: ScaleRow;
  today: string;
  onClose: () => void;
}

/**
 * A scale's grades, each changed on its own from a date with the reason
 * kept in the history. Grades already given keep the bands they were
 * given under.
 */
export function BandsSheet({ open, scale, today, onClose }: BandsSheetProps) {
  const bands = (scale.versions[0]?.bands ?? []).map((band, index) =>
    draftOf(band, `${scale.versions[0]?.effectiveFrom ?? ""}-${String(index)}`),
  );
  const band = useBandEditing();
  return (
    <>
      <SheetPanel
        open={open}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
        title={scaleTitle(scale)}
        description={m.gradingBandsHint()}
      >
        <BandsTable
          bands={bands}
          onEdit={(draft) => band.open(draft)}
          onRemove={(draft) => band.open(draft, true)}
          onAdd={() => band.open(null)}
        />
      </SheetPanel>
      <BandSheets
        bands={bands}
        target={{ kind: "saved", scaleId: scale.id, today }}
        editing={band.editing}
        onClose={band.close}
      />
    </>
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
      submitLabel={m.gradingRetire()}
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
        label={m.gradingReason()}
        errors={tried && !reason.trim() ? [m.gradingReasonNeeded()] : undefined}
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
