import type { ExamBoard } from "@faridalms/domain/exams";

import { EXAM_BOARDS } from "@faridalms/domain/exams";
import { Button } from "@faridalms/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, GraduationCap, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { Column, RowAction } from "~/components/system/DataTable";

import { BOARD_LABEL, boardTitle } from "~/components/exams/names";
import { CheckboxRow } from "~/components/people/fields";
import { labelOf } from "~/components/people/format";
import { ConfirmDialog } from "~/components/system/ConfirmDialog";
import { DataTable } from "~/components/system/DataTable";
import { SelectField, TextField } from "~/components/system/field";
import { SheetForm } from "~/components/system/SheetForm";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { classOptionsQuery } from "~/queries/classes";
import { examOverviewQuery } from "~/queries/exams";
import { retireProgramme, saveProgramme } from "~/server/grading";
import { formatList, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { GradingOverview } from "./ScalesTab";

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
            {names.levels(row)}
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

export function ProgrammesTable({
  overview,
  onAdd,
  onEdit,
  onRetire,
}: {
  overview: GradingOverview;
  onAdd: () => void;
  onEdit: (row: ProgrammeRow) => void;
  onRetire: (row: ProgrammeRow) => void;
}) {
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

export function ProgrammeSheet({
  open,
  programme,
  overview,
  onClose,
}: {
  open: boolean;
  programme?: ProgrammeRow;
  overview: GradingOverview;
  onClose: () => void;
}) {
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
  const [tried, setTried] = useState(false);
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
        if (!titleEn.trim() && !titleAr.trim()) return;
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
    </SheetForm>
  );
}

export function RetireProgrammeDialog({
  open,
  programme,
  onClose,
}: {
  open: boolean;
  programme: ProgrammeRow;
  onClose: () => void;
}) {
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
