import type { ExamBoard, ExamSeries } from "@faridalms/domain/exams";
import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";
import type { Facet } from "@faridalms/ui/system/index-toolbar";
import type { Tone } from "@faridalms/ui/system/status";

import { EXAM_BOARDS, seriesId } from "@faridalms/domain/exams";
import { DataTable } from "@faridalms/ui/system/data-table";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusBadge } from "@faridalms/ui/system/status";
import {
  createFileRoute,
  stripSearchParams,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import * as v from "valibot";

import { attempt } from "../actions";
import { ReasonSheet } from "../components/ReasonSheet";
import { WhyField } from "../components/Why";
import { BOARD_NAMES, formatDay, formatMonth, seriesName } from "../format";
import { listSeries, saveSeries } from "../server/directory";

const STATUSES = ["offered", "ended", "retired"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_NAMES: Record<Status, string> = {
  offered: "Offered",
  ended: "Ended",
  retired: "Retired",
};

const STATUS_TONE: Record<Status, Tone> = {
  offered: "success",
  ended: "neutral",
  retired: "neutral",
};

const search = v.object({
  board: v.fallback(v.optional(v.array(v.picklist(EXAM_BOARDS)), []), []),
  year: v.fallback(
    v.optional(v.array(v.pipe(v.string(), v.regex(/^\d{4}$/))), []),
    [],
  ),
  status: v.fallback(v.optional(v.array(v.picklist(STATUSES)), []), []),
});

export const Route = createFileRoute("/series")({
  validateSearch: search,
  search: {
    middlewares: [stripSearchParams({ board: [], year: [], status: [] })],
  },
  loader: () => listSeries(),
  component: SeriesPage,
});

/**
 * Whether schools can add a session: not once an operator retired it, and
 * not once its keep-until day has passed, as the cells decide.
 */
function statusOf(row: ExamSeries, today: string): Status {
  if (row.retired) return "retired";
  return row.keepUntil < today ? "ended" : "offered";
}

const yearOf = (row: ExamSeries) => row.sitsIn.slice(0, 4);

/** Next year's sessions first, the long-ended ones last; boards in their order. */
const newestFirst = (a: ExamSeries, b: ExamSeries) =>
  b.sitsIn.localeCompare(a.sitsIn) ||
  EXAM_BOARDS.indexOf(a.board) - EXAM_BOARDS.indexOf(b.board);

function columnsFor(today: string): Column<ExamSeries>[] {
  return [
    {
      id: "session",
      header: "Session",
      primary: true,
      cell: (row) => (
        <span className="truncate font-medium">{formatMonth(row.sitsIn)}</span>
      ),
    },
    {
      id: "board",
      header: "Board",
      cell: (row) => BOARD_NAMES[row.board],
    },
    {
      id: "keep",
      header: "Keep until",
      cell: (row) => formatDay(row.keepUntil),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => {
        const status = statusOf(row, today);
        return (
          <StatusBadge tone={STATUS_TONE[status]}>
            {STATUS_NAMES[status]}
          </StatusBadge>
        );
      },
    },
  ];
}

function cardFor(today: string): DataTableCard<ExamSeries> {
  return {
    title: (row) => (
      <span className="font-medium" dir="auto">
        {seriesName(row)}
      </span>
    ),
    status: (row) => STATUS_NAMES[statusOf(row, today)],
    fact: (row) => `Keep until ${formatDay(row.keepUntil)}`,
  };
}

const BOARD_OPTIONS = EXAM_BOARDS.map((board) => ({
  value: board,
  label: BOARD_NAMES[board],
}));

const KEEP_HINT =
  "After results enquiries and appeals close. Schools that follow the board's date keep work until then.";

/** What a save sends, with the session's month as its first day. */
interface Saved {
  board: ExamBoard;
  sitsIn: string;
  keepUntil: string;
  retired: boolean;
  reason: string;
}

/** Saves a session and reports what went wrong, or null when it was saved. */
function useSave() {
  const router = useRouter();
  const save = useServerFn(saveSeries);
  return async (data: Saved, done: string) => {
    const failed = await attempt(
      () => save({ data }),
      "The session could not be saved. Try again.",
    );
    if (failed) return failed;
    toast.success(done);
    await router.invalidate();
    return null;
  };
}

interface AddSessionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  series: ExamSeries[];
}

/** A board's new session, named by the board and the month it sits in. */
function AddSession({ open, onOpenChange, series }: AddSessionProps) {
  const save = useSave();
  const [board, setBoard] = useState<ExamBoard>("cambridge");
  const [month, setMonth] = useState("");
  const [keepUntil, setKeepUntil] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sitsIn = month ? `${month}-01` : "";
  const listed = month
    ? series.find((row) => row.id === seriesId(board, sitsIn))
    : undefined;
  const early = Boolean(sitsIn && keepUntil && keepUntil <= sitsIn);
  const monthError = !month
    ? "Choose the month it sits in."
    : listed
      ? `${seriesName(listed)} is already listed. Change it from its row.`
      : null;
  const keepError = !keepUntil
    ? "Choose the day its work may be deleted."
    : early
      ? "Keep until must come after the session."
      : null;
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setMonth("");
          setKeepUntil("");
          setReason("");
          setSubmitted(false);
          setError(null);
        }
        onOpenChange(next);
      }}
      title="Add a session"
      submitLabel="Add session"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (monthError || keepError || !reason.trim()) return;
        setPending(true);
        setError(null);
        const failed = await save(
          { board, sitsIn, keepUntil, retired: false, reason: reason.trim() },
          "Session added. Schools can add it within a minute.",
        );
        setPending(false);
        if (failed) setError(failed);
        else onOpenChange(false);
      }}
    >
      <SelectField
        label="Board"
        value={board}
        options={BOARD_OPTIONS}
        onChange={setBoard}
      />
      <TextField
        label="Month"
        type="month"
        width="date"
        value={month}
        errors={submitted && monthError ? [monthError] : undefined}
        onChange={(event) => setMonth(event.target.value)}
      />
      <TextField
        label="Keep until"
        type="date"
        width="date"
        hint={KEEP_HINT}
        value={keepUntil}
        errors={submitted && keepError ? [keepError] : undefined}
        onChange={(event) => setKeepUntil(event.target.value)}
      />
      <WhyField
        value={reason}
        onChange={setReason}
        submitted={submitted}
        placeholder="For example: dates from the board's 2027 handbook, section 7"
      />
    </SheetForm>
  );
}

interface ChangeSessionProps {
  session: ExamSeries | null;
  onClose: () => void;
}

/** Moves a session's keep-until day, as a board does when it changes its dates. */
function ChangeSession({ session, onClose }: ChangeSessionProps) {
  const save = useSave();
  const [keepUntil, setKeepUntil] = useState(session?.keepUntil ?? "");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keepError = !keepUntil
    ? "Choose the day its work may be deleted."
    : session && keepUntil <= session.sitsIn
      ? "Keep until must come after the session."
      : null;
  return (
    <SheetForm
      open={session !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={session ? `Change ${seriesName(session)}` : "Change the session"}
      submitLabel="Save changes"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (!session || keepError || !reason.trim()) return;
        setPending(true);
        setError(null);
        const failed = await save(
          {
            board: session.board,
            sitsIn: session.sitsIn,
            keepUntil,
            retired: session.retired,
            reason: reason.trim(),
          },
          "Session saved. Cells see it within a minute.",
        );
        setPending(false);
        if (failed) setError(failed);
        else onClose();
      }}
    >
      <TextField
        label="Keep until"
        type="date"
        width="date"
        hint={KEEP_HINT}
        value={keepUntil}
        errors={submitted && keepError ? [keepError] : undefined}
        onChange={(event) => setKeepUntil(event.target.value)}
      />
      <WhyField
        value={reason}
        onChange={setReason}
        submitted={submitted}
        placeholder="For example: the board moved its appeals deadline"
      />
    </SheetForm>
  );
}

/**
 * The boards' official sessions that schools add to keep coursework for,
 * and the day each one's work may be deleted. An operator adds next year's
 * sessions as boards publish them, moves a keep-until day when a board
 * changes it, and retires a session added by mistake.
 */
function SeriesPage() {
  const { series, today } = Route.useLoaderData();
  const { board, year, status } = Route.useSearch();
  const navigate = Route.useNavigate();
  const save = useSave();
  const [adding, setAdding] = useState(false);
  const [changing, setChanging] = useState<ExamSeries | null>(null);
  const [opened, setOpened] = useState(0);
  const [toggling, setToggling] = useState<ExamSeries | null>(null);
  const go = (patch: Partial<v.InferOutput<typeof search>>) =>
    void navigate({
      search: (previous) => ({ ...previous, ...patch }),
      replace: true,
      resetScroll: false,
    });
  const rows = series
    .filter(
      (row) =>
        (board.length === 0 || board.includes(row.board)) &&
        (year.length === 0 || year.includes(yearOf(row))) &&
        (status.length === 0 || status.includes(statusOf(row, today))),
    )
    .toSorted(newestFirst);
  const years = [...new Set(series.map(yearOf))].toSorted().toReversed();
  const facets: Facet[] = [
    {
      id: "board",
      label: "Board",
      options: EXAM_BOARDS.map((value) => ({
        value,
        label: BOARD_NAMES[value],
        count: series.filter((row) => row.board === value).length,
      })),
      selected: board,
      onChange: (selected) =>
        go({ board: EXAM_BOARDS.filter((value) => selected.includes(value)) }),
    },
    {
      id: "year",
      label: "Year",
      options: years.map((value) => ({
        value,
        label: value,
        count: series.filter((row) => yearOf(row) === value).length,
      })),
      selected: year,
      onChange: (selected) => go({ year: selected }),
    },
    {
      id: "status",
      label: "Status",
      options: STATUSES.map((value) => ({
        value,
        label: STATUS_NAMES[value],
        count: series.filter((row) => statusOf(row, today) === value).length,
      })),
      selected: status,
      onChange: (selected) =>
        go({ status: STATUSES.filter((value) => selected.includes(value)) }),
    },
  ];
  return (
    <Page width="list">
      <PageHeader
        title="Exam sessions"
        count={series.length}
        description="The boards' sessions schools add for coursework, and the day each one's work may be deleted."
        action={{
          label: "Add a session",
          icon: Plus,
          onClick: () => setAdding(true),
        }}
        menu={[
          {
            label: "Changes to sessions",
            onSelect: () =>
              navigate({
                to: "/changes",
                search: { action: ["series.create", "series.update"] },
              }),
          },
        ]}
      />
      <DataTable
        caption="Exam sessions"
        rows={rows}
        columns={columnsFor(today)}
        rowLabel={seriesName}
        toolbar={{
          facets,
          onReset: () => go({ board: [], year: [], status: [] }),
        }}
        rowActions={(row) => [
          {
            label: "Change",
            inline: true,
            onSelect: () => {
              setOpened((count) => count + 1);
              setChanging(row);
            },
          },
          {
            label: row.retired ? "Offer again" : "Retire",
            onSelect: () => setToggling(row),
          },
          {
            label: "Show its changes",
            onSelect: () =>
              navigate({ to: "/changes", search: { q: seriesName(row) } }),
          },
        ]}
        card={cardFor(today)}
        empty={{
          icon: CalendarClock,
          title: "Add the first session",
          description:
            "Schools add a board's session to keep its coursework as long as the board asks.",
        }}
      />
      <AddSession open={adding} onOpenChange={setAdding} series={series} />
      <ChangeSession
        key={opened}
        session={changing}
        onClose={() => setChanging(null)}
      />
      <ReasonSheet
        open={toggling !== null}
        onOpenChange={(open) => {
          if (!open) setToggling(null);
        }}
        title={
          toggling
            ? toggling.retired
              ? `Offer ${seriesName(toggling)} again`
              : `Retire ${seriesName(toggling)}`
            : ""
        }
        submitLabel={toggling?.retired ? "Offer again" : "Retire session"}
        destructive={!toggling?.retired}
        placeholder={
          toggling?.retired
            ? "For example: retired by mistake"
            : "For example: added twice, the board sits it in May"
        }
        onSubmit={async (reason) => {
          if (!toggling) return null;
          return save(
            {
              board: toggling.board,
              sitsIn: toggling.sitsIn,
              keepUntil: toggling.keepUntil,
              retired: !toggling.retired,
              reason,
            },
            toggling.retired
              ? "Session offered again. Schools can add it within a minute."
              : "Session retired. Schools can no longer add it.",
          );
        }}
      />
    </Page>
  );
}
