import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type { ReactNode } from "react";

import { Button } from "@faridalms/ui/button";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import { DataTable, RowButton } from "@faridalms/ui/system/data-table";
import {
  NumberField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CircleAlert,
  GraduationCap,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { inLocale } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { retireProgramme, saveProgramme } from "~/server/grading";
import { formatList, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { GradingOverview } from "./Scales";

import { weightsLine } from "./format";
import { programmeParts } from "./slots";

export type ProgrammeRow = GradingOverview["programmes"][number];

const NONE = "none";

const title = (row: { titleEn: string | null; titleAr: string | null }) =>
  inLocale(row.titleEn, row.titleAr);

function useNames(overview: GradingOverview) {
  const parts = useSlot(programmeParts);
  const reads = useQueries({
    queries: parts.map((part) => part.query()),
  });
  const summary = (row: ProgrammeRow) =>
    formatList(
      parts.flatMap((part, index) => {
        const said = part.summary(reads[index]?.data, row.parts[part.key]);
        return said ? [said] : [];
      }),
    );
  const scale = (row: ProgrammeRow) => {
    const found = overview.scales.find((item) => item.id === row.scaleId);
    return found ? title(found) : m.gradingNoScale();
  };
  return { summary, scale, parts, reads };
}

function columns(names: ReturnType<typeof useNames>): Column<ProgrammeRow>[] {
  return [
    {
      id: "name",
      header: m.gradingProgramme(),
      primary: true,
      cell: (row) => (
        <span className="grid gap-0.5">
          <span className="truncate font-medium" dir="auto">
            {title(row)}
          </span>
          <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
            {[names.summary(row), weightsLine(row.categories)]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      ),
    },
    { id: "scale", header: m.gradingScale(), cell: (row) => names.scale(row) },
    {
      id: "classes",
      header: m.gradingClasses(),
      className: "text-end",
      cell: (row) => (
        <span className="tabular-nums">{formatNumber(row.classes)}</span>
      ),
    },
  ];
}

function programmeCard(names: ReturnType<typeof useNames>) {
  return {
    title: (row: ProgrammeRow) => (
      <span className="font-medium" dir="auto">
        {title(row)}
      </span>
    ),
    fact: names.scale,
  };
}

export interface ProgrammesTableProps {
  overview: GradingOverview;
  onAdd: () => void;
  onEdit: (row: ProgrammeRow) => void;
  onRetire: (row: ProgrammeRow) => void;
}

export function ProgrammesTable({
  overview,
  onAdd,
  onEdit,
  onRetire,
}: ProgrammesTableProps) {
  const names = useNames(overview);
  const rowActions = (row: ProgrammeRow): RowAction[] => [
    {
      label: m.gradingEditProgramme(),
      icon: Pencil,
      onSelect: () => onEdit(row),
    },
    {
      label: m.gradingRetireProgramme(),
      icon: Archive,
      onSelect: () => onRetire(row),
    },
  ];
  return (
    <DataTable
      caption={m.gradingProgrammesCaption()}
      rows={overview.programmes}
      columns={columns(names)}
      rowLabel={title}
      rowActions={rowActions}
      card={programmeCard(names)}
      empty={{
        icon: GraduationCap,
        title: m.gradingProgrammesEmpty(),
        description: m.gradingProgrammesEmptyHint(),
        action: (
          <Button type="button" className="max-md:h-10" onClick={onAdd}>
            <Plus aria-hidden />
            {m.gradingAddProgramme()}
          </Button>
        ),
      }}
    />
  );
}

interface CategoryDraft {
  key: string;
  id?: string;
  titleEn: string;
  titleAr: string;
  weight: number | null;
}

const weightTotal = (rows: readonly CategoryDraft[]) =>
  rows.reduce((sum, row) => sum + (row.weight ?? 0), 0);

const categoryName = (row: CategoryDraft) =>
  inLocale(row.titleEn.trim() || null, row.titleAr.trim() || null);

/**
 * What stops the categories being saved with the programme: weights that
 * do not make 100. With none at all, work counts by its points.
 */
function weightsProblem(rows: readonly CategoryDraft[]): string | null {
  const total = weightTotal(rows);
  return rows.length && Math.abs(total - 100) >= 0.01
    ? m.gradingWeightsTotal({ total: formatNumber(total) })
    : null;
}

type CategoryOpener = (row: CategoryDraft, text: string) => ReactNode;

// Built per render: headers read the request's locale.
function categoryColumns(
  opener: CategoryOpener,
): Column<CategoryDraft & { id: string }>[] {
  const ar = getLocale() === "ar";
  return [
    {
      id: "name",
      header: m.gradingCategory(),
      primary: true,
      cell: (row) => opener(row, categoryName(row)),
    },
    {
      id: "other",
      header: ar ? m.gradingTitleEn() : m.gradingTitleAr(),
      cell: (row) => (
        <span lang={ar ? "en" : "ar"} dir="auto">
          {ar ? row.titleEn : row.titleAr}
        </span>
      ),
    },
    {
      id: "weight",
      header: m.gradingWeight(),
      align: "end",
      cell: (row) => formatNumber(row.weight ?? 0),
    },
  ];
}

function categoryCard(opener: CategoryOpener) {
  return {
    title: (row: CategoryDraft) => opener(row, categoryName(row)),
    fact: (row: CategoryDraft) =>
      m.gradingCategoryWeighs({ weight: formatNumber(row.weight ?? 0) }),
  };
}

interface CategorySheetProps {
  categories: CategoryDraft[];
  /** The category being changed; none to add one. */
  category: CategoryDraft | null;
  open: boolean;
  onDone: (categories: CategoryDraft[]) => void;
  onClose: () => void;
}

/**
 * One kind of work and its weight, kept with the programme when it is
 * saved; the sheet says what the weights then add up to.
 */
function CategorySheet({
  categories,
  category,
  open,
  onDone,
  onClose,
}: CategorySheetProps) {
  const [draft, setDraft] = useState<CategoryDraft>(
    () =>
      category ?? {
        key: crypto.randomUUID(),
        titleEn: "",
        titleAr: "",
        weight: null,
      },
  );
  const [tried, setTried] = useState(false);
  const others = categories.filter((row) => row.key !== draft.key);
  const unnamed = !draft.titleEn.trim() && !draft.titleAr.trim();
  const weightless =
    draft.weight === null || draft.weight <= 0 || draft.weight > 100;
  const total = weightTotal([...others, draft]);
  const set = (change: Partial<CategoryDraft>) =>
    setDraft((current) => ({ ...current, ...change }));
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        category
          ? m.gradingCategoryEdit({ category: categoryName(category) })
          : m.gradingAddCategory()
      }
      submitLabel={category ? m.gradingCategorySave() : m.gradingAddCategory()}
      onSubmit={() => {
        setTried(true);
        if (unnamed || weightless) return;
        onDone(
          category
            ? categories.map((row) => (row.key === draft.key ? draft : row))
            : [...categories, draft],
        );
        onClose();
      }}
    >
      <TextField
        id="category-title-en"
        label={m.gradingTitleEn()}
        width="name"
        lang="en"
        maxLength={60}
        autoComplete="off"
        value={draft.titleEn}
        onChange={(event) => set({ titleEn: event.target.value })}
        errors={tried && unnamed ? [m.gradingCategoryNameOne()] : undefined}
      />
      <TextField
        id="category-title-ar"
        label={m.gradingTitleAr()}
        width="name"
        lang="ar"
        dir="rtl"
        maxLength={60}
        autoComplete="off"
        value={draft.titleAr}
        onChange={(event) => set({ titleAr: event.target.value })}
      />
      <NumberField
        id="category-weight"
        label={m.gradingWeight()}
        hint={m.gradingWeightsWithThis({
          total: formatNumber(Number(total.toFixed(2))),
        })}
        decimals={2}
        value={draft.weight}
        onChange={(weight) => set({ weight })}
        errors={
          tried && weightless ? [m.gradingCategoryWeightOne()] : undefined
        }
      />
    </SheetForm>
  );
}

interface CategoriesEditorProps {
  value: CategoryDraft[];
  onChange: (value: CategoryDraft[]) => void;
  problem: string | null;
}

/**
 * How the programme's work weighs in a term grade: a row a kind of work,
 * each opened on its own, and the total under them. Weights add up to 100;
 * with none, every piece of work counts by its points.
 */
function CategoriesEditor({ value, onChange, problem }: CategoriesEditorProps) {
  const [editing, setEditing] = useState<{
    category: CategoryDraft | null;
    key: number;
    open: boolean;
  } | null>(null);
  const open = (category: CategoryDraft | null) =>
    setEditing((current) => ({
      category,
      key: (current?.key ?? 0) + 1,
      open: true,
    }));
  const opener: CategoryOpener = (row, text) => (
    <RowButton onClick={() => open(row)}>{text}</RowButton>
  );
  const total = weightTotal(value);
  const add = (variant: "default" | "outline") =>
    value.length < 12 ? (
      <Button
        type="button"
        variant={variant}
        className="max-md:h-10"
        onClick={() => open(null)}
      >
        <Plus aria-hidden />
        {m.gradingAddCategory()}
      </Button>
    ) : undefined;
  return (
    <section aria-labelledby="programme-categories" className="grid gap-2">
      <h3 id="programme-categories" className="text-sm leading-5 font-medium">
        {m.gradingCategories()}
      </h3>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.gradingCategoriesHint()}
      </p>
      <DataTable
        caption={m.gradingCategoriesTable()}
        rows={value.map((row) => Object.assign({ id: row.key }, row))}
        columns={categoryColumns(opener)}
        rowLabel={categoryName}
        rowActions={(row) => [
          { label: m.recordEdit(), icon: Pencil, onSelect: () => open(row) },
          {
            label: m.gradingCategoryRemove(),
            icon: Trash2,
            onSelect: () =>
              onChange(value.filter((other) => other.key !== row.key)),
          },
        ]}
        actions={add("outline")}
        totals={[
          {
            id: "total",
            label: m.gradingWeightsTotalLabel(),
            cells: {
              weight: (
                <span className={problem ? "text-destructive" : undefined}>
                  {m.gradingWeightsOutOf({
                    total: formatNumber(Number(total.toFixed(2))),
                  })}
                </span>
              ),
            },
          },
        ]}
        card={categoryCard(opener)}
        empty={{
          title: m.gradingCategoriesNone(),
          action: add("outline"),
        }}
      />
      {problem ? (
        <p
          role="alert"
          className="flex items-start gap-1.5 text-[13px] leading-[18px] text-destructive"
        >
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden />
          {problem}
        </p>
      ) : null}
      {editing ? (
        <CategorySheet
          key={editing.key}
          categories={value}
          category={editing.category}
          open={editing.open}
          onDone={onChange}
          onClose={() =>
            setEditing((current) => current && { ...current, open: false })
          }
        />
      ) : null}
    </section>
  );
}

export interface ProgrammeSheetProps {
  open: boolean;
  programme?: ProgrammeRow;
  overview: GradingOverview;
  onClose: () => void;
}

export function ProgrammeSheet({
  open,
  programme,
  overview,
  onClose,
}: ProgrammeSheetProps) {
  const queryClient = useQueryClient();
  const names = useNames(overview);
  const [titleEn, setTitleEn] = useState(programme?.titleEn ?? "");
  const [titleAr, setTitleAr] = useState(programme?.titleAr ?? "");
  const [parts, setParts] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      names.parts.map((part) => [
        part.key,
        programme?.parts[part.key] ?? part.initial(),
      ]),
    ),
  );
  const [scaleId, setScaleId] = useState(programme?.scaleId ?? NONE);
  const [categories, setCategories] = useState<CategoryDraft[]>(() =>
    (programme?.categories ?? []).map((row) => ({
      key: row.id,
      id: row.id,
      titleEn: row.titleEn ?? "",
      titleAr: row.titleAr ?? "",
      weight: row.weight,
    })),
  );
  const [tried, setTried] = useState(false);
  const weightsIssue = weightsProblem(categories);
  const mutation = useMutation({
    mutationFn: () =>
      saveProgramme({
        data: {
          ...(programme ? { id: programme.id } : {}),
          titleEn: titleEn.trim() || null,
          titleAr: titleAr.trim() || null,
          parts,
          scaleId: scaleId === NONE ? null : scaleId,
          categories: categories.map((row) => ({
            ...(row.id ? { id: row.id } : {}),
            titleEn: row.titleEn.trim() || null,
            titleAr: row.titleAr.trim() || null,
            weight: row.weight ?? 0,
          })),
        },
      }),
    meta: { inlineError: true },
  });
  const untitled = tried && !titleEn.trim() && !titleAr.trim();
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={programme ? m.gradingEditProgramme() : m.gradingAddProgramme()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        setTried(true);
        if ((!titleEn.trim() && !titleAr.trim()) || weightsIssue) return;
        try {
          await mutation.mutateAsync();
        } catch {
          return;
        }
        await queryClient.invalidateQueries({ queryKey: ["grading"] });
        toast.success(m.managementSaved());
        onClose();
      }}
    >
      <TextField
        id="programme-title-en"
        label={m.gradingTitleEn()}
        hint={m.gradingProgrammeTitleHint()}
        width="name"
        lang="en"
        autoComplete="off"
        value={titleEn}
        onChange={(event) => setTitleEn(event.target.value)}
        errors={untitled ? [m.gradingTitleNeeded()] : undefined}
      />
      <TextField
        id="programme-title-ar"
        label={m.gradingTitleAr()}
        width="name"
        lang="ar"
        dir="rtl"
        autoComplete="off"
        value={titleAr}
        onChange={(event) => setTitleAr(event.target.value)}
      />
      {names.parts.map((part, index) => (
        <part.Field
          key={part.key}
          read={names.reads[index]?.data}
          value={parts[part.key]}
          onChange={(value) =>
            setParts((current) => ({ ...current, [part.key]: value }))
          }
        />
      ))}
      <SelectField
        id="programme-scale"
        label={m.gradingScale()}
        hint={m.gradingProgrammeScaleHint()}
        value={scaleId}
        options={[
          { value: NONE, label: m.gradingNoScale() },
          ...overview.scales.map((row) => ({
            value: row.id,
            label: title(row),
          })),
        ]}
        onChange={setScaleId}
      />
      <CategoriesEditor
        value={categories}
        onChange={setCategories}
        problem={tried ? weightsIssue : null}
      />
    </SheetForm>
  );
}

export interface RetireProgrammeDialogProps {
  open: boolean;
  programme: ProgrammeRow;
  onClose: () => void;
}

export function RetireProgrammeDialog({
  open,
  programme,
  onClose,
}: RetireProgrammeDialogProps) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => retireProgramme({ data: { id: programme.id } }),
    meta: { inlineError: true },
  });
  return (
    <ConfirmDialog
      open={open}
      title={m.gradingRetireProgrammeTitle({ name: title(programme) })}
      body={m.gradingRetireProgrammeBody()}
      confirmLabel={m.gradingRetire()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : undefined}
      onCancel={onClose}
      onConfirm={() =>
        void mutation.mutateAsync().then(
          async () => {
            await queryClient.invalidateQueries({ queryKey: ["grading"] });
            toast.success(m.gradingProgrammeRetired());
            onClose();
          },
          () => undefined,
        )
      }
    />
  );
}
