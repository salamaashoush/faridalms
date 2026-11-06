import type { ExamSeries } from "@faridalms/domain/exams";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";

import { Button } from "@faridalms/ui/button";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import { DataTable } from "@faridalms/ui/system/data-table";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusBadge } from "@faridalms/ui/system/status";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CalendarRange,
  Landmark,
  Pencil,
  Plus,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { getExamOverview } from "~/server/exams";

import { CheckboxRow } from "~/components/people/fields";
import * as m from "~/i18n/messages";
import {
  addOfficialSession,
  retireExamSession,
  saveExamBoard,
  saveExamSession,
} from "~/server/exams";
import { formatDate, formatMonthLabel } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { BOARD_LABEL, boardTitle, sessionBoard, sessionName } from "./names";

export type ExamOverview = Awaited<ReturnType<typeof getExamOverview>>;
export type ExamSession = ExamOverview["sessions"][number];
export type ExamBoardRow = ExamOverview["boards"][number];

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["exams"] });
}

interface KeepUntilProps {
  session: ExamSession;
}

function KeepUntil({ session }: KeepUntilProps) {
  const below =
    session.boardKeepUntil !== null &&
    session.keepUntil < session.boardKeepUntil;
  return (
    <span className="grid gap-0.5">
      <span>{formatDate(session.keepUntil)}</span>
      <span className="text-[13px] leading-[18px] text-muted-foreground">
        {session.official
          ? session.ownKeepUntil
            ? below
              ? m.examKeepBelowBoard({
                  date: formatDate(session.boardKeepUntil ?? ""),
                })
              : m.examKeepSchoolDate()
            : m.examKeepBoardDate()
          : m.examKeepSchoolDate()}
      </span>
    </span>
  );
}

interface RulesProps {
  session: ExamSession;
}

function Rules({ session }: RulesProps) {
  const rules = [
    session.declarationRequired ? m.examRuleDeclaration() : null,
    session.aiEvidenceRequired ? m.examRuleAiEvidence() : null,
  ].filter((rule) => rule !== null);
  return rules.length ? (
    <span className="flex flex-wrap gap-1">
      {rules.map((rule) => (
        <StatusBadge key={rule} tone="neutral">
          {rule}
        </StatusBadge>
      ))}
    </span>
  ) : (
    <span className="text-muted-foreground">{m.examRuleNone()}</span>
  );
}

function sessionColumns(
  boards: readonly ExamBoardRow[],
): Column<ExamSession>[] {
  return [
    {
      id: "name",
      header: m.examSession(),
      primary: true,
      cell: (row) => (
        <span className="grid gap-0.5">
          <span className="truncate font-medium" dir="auto">
            {sessionName(row)}
          </span>
          <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
            {row.official ? m.examKeptByFarida() : sessionBoard(row, boards)}
          </span>
        </span>
      ),
    },
    {
      id: "keep",
      header: m.examKeepUntil(),
      cell: (row) => <KeepUntil session={row} />,
    },
    {
      id: "rules",
      header: m.examRules(),
      cell: (row) => <Rules session={row} />,
    },
  ];
}

const sessionCard = {
  title: (row: ExamSession) => (
    <span className="font-medium" dir="auto">
      {sessionName(row)}
    </span>
  ),
  fact: (row: ExamSession) =>
    m.examKeepUntilOn({ date: formatDate(row.keepUntil) }),
};

interface BoardRow {
  id: string;
  title: string;
  own: ExamBoardRow | null;
}

const keptBy = (row: BoardRow) =>
  row.own ? m.examKeptBySchool() : m.examKeptByFarida();

function boardColumns(): Column<BoardRow>[] {
  return [
    {
      id: "name",
      header: m.examBoard(),
      primary: true,
      cell: (row) => (
        <span className="truncate font-medium" dir="auto">
          {row.title}
        </span>
      ),
    },
    { id: "kept", header: m.examSessionsKeptBy(), cell: keptBy },
  ];
}

const boardCard = {
  title: (row: BoardRow) => (
    <span className="font-medium" dir="auto">
      {row.title}
    </span>
  ),
  fact: keptBy,
};

export interface SessionsTableProps {
  overview: ExamOverview;
  onAdd: () => void;
  onEdit: (session: ExamSession) => void;
  onRetire: (session: ExamSession) => void;
}

export function SessionsTable({
  overview,
  onAdd,
  onEdit,
  onRetire,
}: SessionsTableProps) {
  const rowActions = (row: ExamSession): RowAction[] => [
    { label: m.examChangeSession(), icon: Pencil, onSelect: () => onEdit(row) },
    {
      label: m.examRetireSession(),
      icon: Archive,
      onSelect: () => onRetire(row),
    },
  ];
  return (
    <DataTable
      caption={m.examSessionsCaption()}
      rows={overview.sessions}
      columns={sessionColumns(overview.boards)}
      rowLabel={sessionName}
      rowActions={rowActions}
      card={sessionCard}
      empty={{
        icon: CalendarRange,
        title: m.examSessionsEmpty(),
        description: m.examSessionsEmptyHint(),
        action: (
          <Button type="button" className="max-md:h-10" onClick={onAdd}>
            <Plus aria-hidden />
            {m.examAddSession()}
          </Button>
        ),
      }}
    />
  );
}

export interface BoardsTableProps {
  overview: ExamOverview;
  onEdit: (board: ExamBoardRow) => void;
}

export function BoardsTable({ overview, onEdit }: BoardsTableProps) {
  const rows: BoardRow[] = [
    ...overview.boards.map((board) => ({
      id: board.id,
      title: boardTitle(board),
      own: board,
    })),
    ...(Object.keys(BOARD_LABEL) as (keyof typeof BOARD_LABEL)[]).map(
      (board) => ({ id: board, title: BOARD_LABEL[board](), own: null }),
    ),
  ];
  return (
    <DataTable
      caption={m.examBoardsCaption()}
      rows={rows}
      columns={boardColumns()}
      rowLabel={(row) => row.title}
      rowActions={(row) => {
        const own = row.own;
        return own
          ? [
              {
                label: m.examChangeBoard(),
                icon: Pencil,
                onSelect: () => onEdit(own),
              },
            ]
          : [];
      }}
      card={boardCard}
      empty={{ icon: Landmark, title: m.examBoardsCaption() }}
    />
  );
}

export interface BoardSheetProps {
  open: boolean;
  board?: ExamBoardRow;
  onClose: () => void;
}

export function BoardSheet({ open, board, onClose }: BoardSheetProps) {
  const refresh = useRefresh();
  const [titleEn, setTitleEn] = useState(board?.titleEn ?? "");
  const [titleAr, setTitleAr] = useState(board?.titleAr ?? "");
  const mutation = useMutation({
    mutationFn: () =>
      saveExamBoard({
        data: {
          ...(board ? { id: board.id } : {}),
          titleEn: titleEn.trim() || null,
          titleAr: titleAr.trim() || null,
        },
      }),
    meta: { inlineError: true },
  });
  const missing = mutation.isError && !titleEn.trim() && !titleAr.trim();
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={board ? m.examChangeBoard() : m.examAddBoard()}
      pending={mutation.isPending}
      error={
        mutation.error && !missing ? getMessageFromError(mutation.error) : null
      }
      onSubmit={async () => {
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
      <p className="text-sm leading-5 text-muted-foreground">
        {m.examBoardHint()}
      </p>
      <TextField
        id="exam-board-en"
        label={m.examTitleEn()}
        width="name"
        lang="en"
        autoComplete="off"
        value={titleEn}
        onChange={(event) => setTitleEn(event.target.value)}
        errors={missing ? [m.examTitleNeeded()] : undefined}
      />
      <TextField
        id="exam-board-ar"
        label={m.examTitleAr()}
        width="name"
        lang="ar"
        dir="rtl"
        autoComplete="off"
        value={titleAr}
        onChange={(event) => setTitleAr(event.target.value)}
      />
    </SheetForm>
  );
}

interface ReasonFieldProps {
  value: string;
  onChange: (value: string) => void;
  missing: boolean;
}

function ReasonField({ value, onChange, missing }: ReasonFieldProps) {
  return (
    <FormField
      id="exam-reason"
      label={m.examReason()}
      hint={m.examReasonHint()}
      errors={missing ? [m.examReasonNeeded()] : undefined}
    >
      {(control) => (
        <Textarea
          {...control}
          dir="auto"
          rows={3}
          maxLength={500}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FormField>
  );
}

type KeepChoice = "board" | "own";

interface Draft {
  source: "official" | "own";
  series: string;
  boardId: string;
  titleEn: string;
  titleAr: string;
  month: string;
  keep: KeepChoice;
  keepUntil: string;
  declarationRequired: boolean;
  aiEvidenceRequired: boolean;
  reason: string;
  belowBoard: boolean;
}

function draftOf(
  session: ExamSession | undefined,
  overview: ExamOverview,
): Draft {
  if (session)
    return {
      source: session.official ? "official" : "own",
      series: session.official?.series ?? "",
      boardId: session.boardId ?? "",
      titleEn: session.titleEn ?? "",
      titleAr: session.titleAr ?? "",
      month: session.sitsIn.slice(0, 7),
      keep: session.official && !session.ownKeepUntil ? "board" : "own",
      keepUntil: session.ownKeepUntil ?? session.keepUntil,
      declarationRequired: session.declarationRequired,
      aiEvidenceRequired: session.aiEvidenceRequired,
      reason: "",
      belowBoard: false,
    };
  return {
    source:
      overview.available.length || !overview.boards.length ? "official" : "own",
    series: overview.available[0]?.id ?? "",
    boardId: overview.boards[0]?.id ?? "",
    titleEn: "",
    titleAr: "",
    month: "",
    keep: "own",
    keepUntil: "",
    declarationRequired: true,
    aiEvidenceRequired: true,
    reason: "",
    belowBoard: false,
  };
}

function seriesLabel(series: ExamSeries) {
  return m.examSessionName({
    board: BOARD_LABEL[series.board](),
    month: formatMonthLabel(series.sitsIn),
  });
}

export interface SessionSheetProps {
  open: boolean;
  session?: ExamSession;
  overview: ExamOverview;
  onClose: () => void;
}

/**
 * Adds a session, from the boards' official list or for one of the school's
 * own boards, or changes one. A change says why; keeping work for less time
 * than the board asks is a choice the officer makes on purpose.
 */
export function SessionSheet({
  open,
  session,
  overview,
  onClose,
}: SessionSheetProps) {
  const refresh = useRefresh();
  const [draft, setDraft] = useState(() => draftOf(session, overview));
  const [tried, setTried] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const official = draft.source === "official";
  const keepUntil = official && draft.keep === "board" ? null : draft.keepUntil;
  const boardDate = session?.boardKeepUntil ?? null;
  const below = Boolean(keepUntil && boardDate && keepUntil < boardDate);
  const reasonMissing = Boolean(session) && !draft.reason.trim();
  const mutation = useMutation({
    mutationFn: () => {
      if (!session && official)
        return addOfficialSession({ data: { series: draft.series } });
      return saveExamSession({
        data: {
          ...(session
            ? { id: session.id, expectedVersion: session.version }
            : { boardId: draft.boardId }),
          titleEn: draft.titleEn.trim() || null,
          titleAr: draft.titleAr.trim() || null,
          sitsIn: session?.official ? session.sitsIn : `${draft.month}-01`,
          keepUntil: keepUntil || null,
          declarationRequired: draft.declarationRequired,
          aiEvidenceRequired: draft.aiEvidenceRequired,
          reason: draft.reason.trim(),
          belowBoard: draft.belowBoard,
        },
      });
    },
    meta: { inlineError: true },
  });
  const ownBoards = overview.boards.map((board) => ({
    value: board.id,
    label: boardTitle(board),
  }));
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={session ? m.examChangeSession() : m.examAddSession()}
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        setTried(true);
        if (reasonMissing || (below && !draft.belowBoard)) return;
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
      {session ? (
        <p className="text-sm leading-5 font-medium" dir="auto">
          {sessionName(session)}
        </p>
      ) : (
        <fieldset className="grid gap-3">
          <legend className="mb-2 text-sm leading-5 font-medium">
            {m.examSessionSource()}
          </legend>
          <RadioGroup
            value={draft.source}
            onValueChange={(next) =>
              set("source", next === "own" ? "own" : "official")
            }
          >
            <label className="flex items-center gap-3 text-sm leading-5">
              <RadioGroupItem
                value="official"
                disabled={!overview.available.length}
              />
              {m.examSourceOfficial()}
            </label>
            <label className="flex items-center gap-3 text-sm leading-5">
              <RadioGroupItem value="own" disabled={!overview.boards.length} />
              {m.examSourceOwn()}
            </label>
          </RadioGroup>
          {overview.boards.length ? null : (
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {m.examNoOwnBoards()}
            </p>
          )}
        </fieldset>
      )}
      {!session && official ? (
        overview.available.length ? (
          <SelectField
            id="exam-series"
            label={m.examSession()}
            hint={m.examOfficialHint()}
            value={draft.series}
            options={overview.available.map((series) => ({
              value: series.id,
              label: seriesLabel(series),
            }))}
            onChange={(value) => set("series", value)}
          />
        ) : (
          <p className="text-sm leading-5 text-muted-foreground">
            {m.examNoOfficialLeft()}
          </p>
        )
      ) : null}
      {!official ? (
        <>
          {session ? null : (
            <SelectField
              id="exam-own-board"
              label={m.examBoard()}
              value={draft.boardId}
              options={ownBoards}
              onChange={(value) => set("boardId", value)}
            />
          )}
          <TextField
            id="exam-session-en"
            label={m.examTitleEn()}
            hint={m.examSessionTitleHint()}
            width="name"
            lang="en"
            autoComplete="off"
            value={draft.titleEn}
            onChange={(event) => set("titleEn", event.target.value)}
            errors={
              tried && !draft.titleEn.trim() && !draft.titleAr.trim()
                ? [m.examTitleNeeded()]
                : undefined
            }
          />
          <TextField
            id="exam-session-ar"
            label={m.examTitleAr()}
            width="name"
            lang="ar"
            dir="rtl"
            autoComplete="off"
            value={draft.titleAr}
            onChange={(event) => set("titleAr", event.target.value)}
          />
          <TextField
            id="exam-session-month"
            label={m.examSitsIn()}
            type="month"
            width="date"
            value={draft.month}
            onChange={(event) => set("month", event.target.value)}
            errors={tried && !draft.month ? [m.examMonthNeeded()] : undefined}
          />
        </>
      ) : null}
      {session || !official ? (
        <>
          {official ? (
            <fieldset className="grid gap-3">
              <legend className="mb-2 text-sm leading-5 font-medium">
                {m.examKeepUntil()}
              </legend>
              <RadioGroup
                value={draft.keep}
                onValueChange={(next) =>
                  set("keep", next === "own" ? "own" : "board")
                }
              >
                <label className="flex items-center gap-3 text-sm leading-5">
                  <RadioGroupItem value="board" />
                  {m.examFollowBoard({ date: formatDate(boardDate ?? "") })}
                </label>
                <label className="flex items-center gap-3 text-sm leading-5">
                  <RadioGroupItem value="own" />
                  {m.examOwnDate()}
                </label>
              </RadioGroup>
            </fieldset>
          ) : null}
          {!official || draft.keep === "own" ? (
            <TextField
              id="exam-keep-until"
              label={official ? m.examOwnDate() : m.examKeepUntil()}
              hint={m.examKeepUntilHint()}
              type="date"
              width="date"
              value={draft.keepUntil}
              onChange={(event) => {
                set("keepUntil", event.target.value);
                set("belowBoard", false);
              }}
              errors={
                tried && !draft.keepUntil
                  ? [m.examKeepUntilNeeded()]
                  : undefined
              }
            />
          ) : null}
          {below ? (
            <div className="grid gap-3 rounded-md border border-warning/40 bg-warning/10 p-3">
              <p className="flex items-start gap-2 text-sm leading-5">
                <TriangleAlert
                  className="mt-0.5 size-4 shrink-0 text-warning"
                  aria-hidden
                />
                {m.examBelowBoardWarning({ date: formatDate(boardDate ?? "") })}
              </p>
              <CheckboxRow
                label={m.examBelowBoardConfirm()}
                checked={draft.belowBoard}
                onChange={(checked) => set("belowBoard", checked)}
              />
              {tried && !draft.belowBoard ? (
                <p
                  role="alert"
                  className="text-[13px] leading-[18px] text-destructive"
                >
                  {m.examBelowBoardNeeded()}
                </p>
              ) : null}
            </div>
          ) : null}
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm leading-5 font-medium">
              {m.examRules()}
            </legend>
            <CheckboxRow
              label={m.examRuleDeclaration()}
              hint={m.examRuleDeclarationHint()}
              checked={draft.declarationRequired}
              onChange={(checked) => set("declarationRequired", checked)}
            />
            <CheckboxRow
              label={m.examRuleAiEvidence()}
              hint={m.examRuleAiEvidenceHint()}
              checked={draft.aiEvidenceRequired}
              onChange={(checked) => set("aiEvidenceRequired", checked)}
            />
          </fieldset>
        </>
      ) : null}
      {session ? (
        <ReasonField
          value={draft.reason}
          onChange={(value) => set("reason", value)}
          missing={tried && reasonMissing}
        />
      ) : null}
    </SheetForm>
  );
}

export interface RetireSheetProps {
  open: boolean;
  session: ExamSession;
  onClose: () => void;
}

export function RetireSheet({ open, session, onClose }: RetireSheetProps) {
  const refresh = useRefresh();
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      retireExamSession({ data: { id: session.id, reason: reason.trim() } }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={m.examRetireSession()}
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
        toast.success(m.examRetired());
        onClose();
      }}
    >
      <p className="text-sm leading-5 font-medium" dir="auto">
        {sessionName(session)}
      </p>
      <p className="text-sm leading-5 text-muted-foreground">
        {m.examRetireHint()}
      </p>
      <ReasonField
        value={reason}
        onChange={setReason}
        missing={tried && !reason.trim()}
      />
    </SheetForm>
  );
}
