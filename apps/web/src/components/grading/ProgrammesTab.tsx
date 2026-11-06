import type { ExamBoard } from "@faridalms/domain/exams";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";

import { EXAM_BOARDS } from "@faridalms/domain/exams";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import { DataTable } from "@faridalms/ui/system/data-table";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, GraduationCap, Pencil, Plus, X } from "lucide-react";
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
  weight: string;
}

interface CategoriesEditorProps {
  value: CategoryDraft[];
  onChange: (value: CategoryDraft[]) => void;
  total: number;
  problem: string | null;
}

/**
 * How the programme's work weighs in a term grade. Weights add up to 100;
 * with none, every piece of work counts by its points.
 */
function CategoriesEditor({
  value,
  onChange,
  total,
  problem,
}: CategoriesEditorProps) {
  const set = (key: string, change: Partial<CategoryDraft>) =>
    onChange(
      value.map((row) => (row.key === key ? { ...row, ...change } : row)),
    );
  const cell = "h-9 min-w-0 px-2 max-md:h-10";
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm leading-5 font-medium">
        {m.gradingCategories()}
      </legend>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.gradingCategoriesHint()}
      </p>
      {value.length ? (
        <div
          aria-hidden
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.5rem_2rem] gap-2 text-xs text-muted-foreground"
        >
          <span>{m.examTitleEn()}</span>
          <span>{m.examTitleAr()}</span>
          <span>{m.gradingWeight()}</span>
        </div>
      ) : null}
      {value.map((row, index) => (
        <div
          key={row.key}
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_4.5rem_2rem] items-center gap-2"
        >
          <Input
            aria-label={m.gradingCategoryEnRow({ row: index + 1 })}
            dir="auto"
            maxLength={60}
            value={row.titleEn}
            onChange={(event) => set(row.key, { titleEn: event.target.value })}
            className={cell}
          />
          <Input
            aria-label={m.gradingCategoryArRow({ row: index + 1 })}
            dir="auto"
            lang="ar"
            maxLength={60}
            value={row.titleAr}
            onChange={(event) => set(row.key, { titleAr: event.target.value })}
            className={cell}
          />
          <Input
            aria-label={m.gradingWeightRow({ row: index + 1 })}
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step="any"
            value={row.weight}
            onChange={(event) => set(row.key, { weight: event.target.value })}
            className={cell}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.gradingRemoveCategory({ row: index + 1 })}
            onClick={() =>
              onChange(value.filter((item) => item.key !== row.key))
            }
            className="max-md:size-10"
          >
            <X aria-hidden />
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="max-md:h-10"
          disabled={value.length >= 12}
          onClick={() =>
            onChange([
              ...value,
              {
                key: crypto.randomUUID(),
                titleEn: "",
                titleAr: "",
                weight: "",
              },
            ])
          }
        >
          <Plus aria-hidden />
          {m.gradingAddCategory()}
        </Button>
        {value.length ? (
          <span className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
            {m.gradingWeightsSum({ total: formatNumber(total) })}
          </span>
        ) : null}
      </div>
      {problem ? (
        <p role="alert" className="text-[13px] leading-[18px] text-destructive">
          {problem}
        </p>
      ) : null}
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
      weight: String(row.weight),
    })),
  );
  const [tried, setTried] = useState(false);
  const total = categories.reduce(
    (sum, row) => sum + (Number(row.weight) || 0),
    0,
  );
  const categoryProblem = !categories.length
    ? null
    : categories.some(
          (row) =>
            (!row.titleEn.trim() && !row.titleAr.trim()) ||
            !(Number(row.weight) > 0),
        )
      ? m.gradingCategoryIncomplete()
      : Math.abs(total - 100) >= 0.01
        ? m.gradingWeightsTotal({ total: formatNumber(total) })
        : null;
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
            weight: Number(row.weight),
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
        if ((!titleEn.trim() && !titleAr.trim()) || categoryProblem) return;
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
        total={total}
        problem={tried ? categoryProblem : null}
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
