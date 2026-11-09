import type { ExamBoard } from "@faridalms/domain/exams";
import type { GridColumn, GridIssue } from "@faridalms/ui/system/data-grid";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";

import { EXAM_BOARDS } from "@faridalms/domain/exams";
import { Button } from "@faridalms/ui/button";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import {
  DataGrid,
  GridAddButton,
  GridRemoveButton,
  NumberCell,
  TextCell,
  useFocusAfterRender,
} from "@faridalms/ui/system/data-grid";
import { DataTable } from "@faridalms/ui/system/data-table";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, GraduationCap, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { BOARD_LABEL, boardTitle } from "~/components/exams/names";
import { CheckboxRow } from "~/components/people/fields";
import { labelOf } from "~/components/people/format";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { classOptionsQuery } from "~/queries/classes";
import { examOverviewQuery } from "~/queries/exams";
import { retireProgramme, saveProgramme } from "~/server/grading";
import { formatList, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { GradingOverview } from "./ScalesTab";

import { weightsLine } from "./format";

export type ProgrammeRow = GradingOverview["programmes"][number];

const NONE = "none";

const title = (row: { titleEn: string | null; titleAr: string | null }) =>
  inLocale(row.titleEn, row.titleAr);

function useNames(overview: GradingOverview) {
  const grades = useQuery(classOptionsQuery).data?.grades ?? [];
  const boards = useQuery(examOverviewQuery).data?.boards ?? [];
  const levels = (row: ProgrammeRow) =>
    formatList(
      grades
        .filter((grade) => row.gradeLevelIds.includes(grade.id))
        .map((grade) => labelOf(grade) ?? grade.code),
    );
  const scale = (row: ProgrammeRow) => {
    const found = overview.scales.find((item) => item.id === row.scaleId);
    return found ? title(found) : m.gradingNoScale();
  };
  const board = (row: ProgrammeRow) => {
    if (row.officialBoard) return BOARD_LABEL[row.officialBoard as ExamBoard]();
    const own = boards.find((item) => item.id === row.boardId);
    return own ? boardTitle(own) : "";
  };
  return { levels, scale, board, grades, boards };
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
            {[names.levels(row), weightsLine(row.categories)]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      ),
    },
    { id: "scale", header: m.gradingScale(), cell: (row) => names.scale(row) },
    {
      id: "board",
      header: m.examBoard(),
      cell: (row) => names.board(row) || m.gradingNoBoard(),
    },
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

const categoryCell = (row: CategoryDraft, field: "en" | "ar" | "weight") =>
  `category-${row.key}-${field}`;

const weightTotal = (rows: readonly CategoryDraft[]) =>
  rows.reduce((sum, row) => sum + (row.weight ?? 0), 0);

/**
 * What stops the categories being saved, each tied to its cell. With none
 * at all, work counts by its points and nothing is asked.
 */
function categoryIssues(rows: readonly CategoryDraft[]): GridIssue[] {
  const issues: GridIssue[] = [];
  rows.forEach((row, index) => {
    if (!row.titleEn.trim() && !row.titleAr.trim())
      issues.push({
        target: categoryCell(row, "en"),
        message: m.gradingCategoryNameNeeded({ row: index + 1 }),
      });
    if (row.weight === null || row.weight <= 0 || row.weight > 100)
      issues.push({
        target: categoryCell(row, "weight"),
        message: m.gradingCategoryWeightNeeded({ row: index + 1 }),
      });
  });
  const last = rows.at(-1);
  const total = weightTotal(rows);
  if (last && !issues.length && Math.abs(total - 100) >= 0.01)
    issues.push({
      target: categoryCell(last, "weight"),
      message: m.gradingWeightsTotal({ total: formatNumber(total) }),
    });
  return issues;
}

interface CategoryGridOptions {
  rows: CategoryDraft[];
  set: (key: string, change: Partial<CategoryDraft>) => void;
  remove: (key: string) => void;
}

// Built per render: headers read the request's locale.
function categoryGrid({ rows, set, remove }: CategoryGridOptions) {
  const row = (draft: CategoryDraft) => rows.indexOf(draft) + 1;
  const rowHeader = {
    header: m.examTitleEn(),
    cell: (draft: CategoryDraft) => (
      <TextCell
        id={categoryCell(draft, "en")}
        label={m.gradingCategoryEnRow({ row: row(draft) })}
        maxLength={60}
        value={draft.titleEn}
        onChange={(titleEn) => set(draft.key, { titleEn })}
      />
    ),
  };
  const figures: GridColumn<CategoryDraft>[] = [
    {
      id: "ar",
      header: m.examTitleAr(),
      cell: (draft) => (
        <TextCell
          id={categoryCell(draft, "ar")}
          label={m.gradingCategoryArRow({ row: row(draft) })}
          lang="ar"
          maxLength={60}
          placeholder={draft.titleEn}
          value={draft.titleAr}
          onChange={(titleAr) => set(draft.key, { titleAr })}
        />
      ),
    },
    {
      id: "weight",
      header: m.gradingWeight(),
      numeric: true,
      cell: (draft) => (
        <NumberCell
          id={categoryCell(draft, "weight")}
          label={m.gradingWeightRow({ row: row(draft) })}
          decimals={2}
          value={draft.weight}
          onChange={(weight) => set(draft.key, { weight })}
        />
      ),
    },
  ];
  const rowEnd = (draft: CategoryDraft) => (
    <GridRemoveButton
      label={m.gradingRemoveCategory({ row: row(draft) })}
      onRemove={() => remove(draft.key)}
    />
  );
  return { rowHeader, columns: figures, rowEnd };
}

interface CategoriesEditorProps {
  value: CategoryDraft[];
  onChange: (value: CategoryDraft[]) => void;
  issues: GridIssue[];
}

/**
 * How the programme's work weighs in a term grade. Weights add up to 100;
 * with none, every piece of work counts by its points.
 */
function CategoriesEditor({ value, onChange, issues }: CategoriesEditorProps) {
  const focusLater = useFocusAfterRender();
  const set = (key: string, change: Partial<CategoryDraft>) =>
    onChange(
      value.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );
  const total = weightTotal(value);
  const add = (
    <GridAddButton
      label={m.gradingAddCategory()}
      disabled={value.length >= 12}
      onAdd={() => {
        const added: CategoryDraft = {
          key: crypto.randomUUID(),
          titleEn: "",
          titleAr: "",
          weight: null,
        };
        onChange([...value, added]);
        focusLater(categoryCell(added, "en"));
      }}
    />
  );
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="mb-1 text-sm leading-5 font-medium">
        {m.gradingCategories()}
      </legend>
      <p className="-mt-1 text-[13px] leading-[18px] text-muted-foreground">
        {m.gradingCategoriesHint()}
      </p>
      {value.length ? (
        <DataGrid<CategoryDraft>
          caption={m.gradingCategoriesTable()}
          editing
          {...categoryGrid({
            rows: value,
            set,
            remove: (key) => onChange(value.filter((row) => row.key !== key)),
          })}
          groups={[{ id: "categories", title: "", rows: value }]}
          rowKey={(row) => row.key}
          totals={{
            label: m.gradingWeightsTotalLabel(),
            cells: {
              weight: (
                <span
                  className={
                    Math.abs(total - 100) < 0.01
                      ? undefined
                      : "text-muted-foreground"
                  }
                >
                  {m.gradingWeightsOutOf({ total: formatNumber(total) })}
                </span>
              ),
            },
          }}
          issues={issues}
          footer={add}
        />
      ) : (
        <div>{add}</div>
      )}
    </fieldset>
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
  const [levels, setLevels] = useState<string[]>(
    programme?.gradeLevelIds ?? [],
  );
  const [scaleId, setScaleId] = useState(programme?.scaleId ?? NONE);
  const [board, setBoard] = useState(
    programme?.officialBoard ?? programme?.boardId ?? NONE,
  );
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
  const categoryProblems = categoryIssues(categories);
  const mutation = useMutation({
    mutationFn: () => {
      const official = (EXAM_BOARDS as readonly string[]).includes(board)
        ? (board as ExamBoard)
        : null;
      return saveProgramme({
        data: {
          ...(programme ? { id: programme.id } : {}),
          titleEn: titleEn.trim() || null,
          titleAr: titleAr.trim() || null,
          gradeLevelIds: levels,
          scaleId: scaleId === NONE ? null : scaleId,
          officialBoard: official,
          boardId: official || board === NONE ? null : board,
          categories: categories.map((row) => ({
            ...(row.id ? { id: row.id } : {}),
            titleEn: row.titleEn.trim() || null,
            titleAr: row.titleAr.trim() || null,
            weight: row.weight ?? 0,
          })),
        },
      });
    },
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
        if ((!titleEn.trim() && !titleAr.trim()) || categoryProblems.length)
          return;
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
        label={m.examTitleEn()}
        hint={m.gradingProgrammeTitleHint()}
        width="name"
        lang="en"
        autoComplete="off"
        value={titleEn}
        onChange={(event) => setTitleEn(event.target.value)}
        errors={untitled ? [m.examTitleNeeded()] : undefined}
      />
      <TextField
        id="programme-title-ar"
        label={m.examTitleAr()}
        width="name"
        lang="ar"
        dir="rtl"
        autoComplete="off"
        value={titleAr}
        onChange={(event) => setTitleAr(event.target.value)}
      />
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm leading-5 font-medium">
          {m.gradingGradeLevels()}
        </legend>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.gradingGradeLevelsHint()}
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          {names.grades.map((grade) => (
            <CheckboxRow
              key={grade.id}
              label={labelOf(grade) ?? grade.code}
              checked={levels.includes(grade.id)}
              onChange={(checked) =>
                setLevels((current) =>
                  checked
                    ? [...current, grade.id]
                    : current.filter((id) => id !== grade.id),
                )
              }
            />
          ))}
        </div>
      </fieldset>
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
      <SelectField
        id="programme-board"
        label={m.examBoard()}
        hint={m.gradingProgrammeBoardHint()}
        value={board}
        options={[
          { value: NONE, label: m.gradingNoBoard() },
          ...EXAM_BOARDS.map((key) => ({
            value: key,
            label: BOARD_LABEL[key](),
          })),
          ...names.boards.map((row) => ({
            value: row.id,
            label: boardTitle(row),
          })),
        ]}
        onChange={setBoard}
      />
      <CategoriesEditor
        value={categories}
        onChange={setCategories}
        issues={tried ? categoryProblems : []}
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
      confirmLabel={m.examRetire()}
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
