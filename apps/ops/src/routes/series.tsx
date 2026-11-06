import type { ExamBoard, ExamSeries } from "@faridalms/domain/exams";
import type { Column } from "@faridalms/ui/system/data-table";

import { EXAM_BOARDS, seriesId } from "@faridalms/domain/exams";
import { DataTable } from "@faridalms/ui/system/data-table";
import {
  CheckboxGroupField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { attempt } from "../actions";
import { ChangeList } from "../components/ChangeList";
import { WhyField } from "../components/Why";
import { BOARD_NAMES, formatDay, formatMonth } from "../format";
import { listSeries, saveSeries } from "../server/directory";

export const Route = createFileRoute("/series")({
  loader: () => listSeries(),
  component: SeriesPage,
});

interface Draft {
  board: ExamBoard;
  month: string;
  keepUntil: string;
  retired: boolean;
}

const EMPTY: Draft = {
  board: "cambridge",
  month: "",
  keepUntil: "",
  retired: false,
};

function sessionName(row: ExamSeries) {
  return `${BOARD_NAMES[row.board]}, ${formatMonth(row.sitsIn)}`;
}

const BOARD_OPTIONS = EXAM_BOARDS.map((board) => ({
  value: board,
  label: BOARD_NAMES[board],
}));

const COLUMNS: Column<ExamSeries>[] = [
  {
    id: "session",
    header: "Session",
    primary: true,
    cell: (row) => (
      <span className="grid min-w-0">
        <span className="truncate font-medium">{sessionName(row)}</span>
        <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
          {row.id}
        </span>
      </span>
    ),
  },
  {
    id: "keep",
    header: "Keep until",
    cell: (row) => formatDay(row.keepUntil),
  },
  {
    id: "state",
    header: "State",
    cell: (row) =>
      row.retired ? (
        <StatusText tone="neutral">Retired</StatusText>
      ) : (
        <StatusText tone="success">Offered</StatusText>
      ),
  },
];

interface SessionSheetProps {
  series: ExamSeries[];
  /** The session being changed, or an empty draft for a new one. */
  draft: Draft | null;
  onClose: () => void;
}

/** Adds a session, or changes one: a board and month name one session. */
function SessionSheet({ series, draft: start, onClose }: SessionSheetProps) {
  const router = useRouter();
  const save = useServerFn(saveSeries);
  const [draft, setDraft] = useState<Draft>(start ?? EMPTY);
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const existing = draft.month
    ? series.find(
        (row) => row.id === seriesId(draft.board, `${draft.month}-01`),
      )
    : undefined;
  return (
    <SheetForm
      open={start !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={existing ? `Change ${sessionName(existing)}` : "Add a session"}
      submitLabel={existing ? "Save changes" : "Add session"}
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (!draft.month || !draft.keepUntil || !reason.trim()) return;
        setPending(true);
        setError(null);
        const failed = await attempt(
          () =>
            save({
              data: {
                board: draft.board,
                sitsIn: `${draft.month}-01`,
                keepUntil: draft.keepUntil,
                retired: draft.retired,
                reason: reason.trim(),
              },
            }),
          "The session could not be saved. Keep-until must come after the session.",
        );
        setPending(false);
        if (failed) {
          setError(failed);
          return;
        }
        toast.success("Session saved. Cells see it within a minute.");
        onClose();
        await router.invalidate();
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        A board and month name one session; choosing one already listed changes
        it.
      </p>
      <SelectField
        label="Board"
        value={draft.board}
        options={BOARD_OPTIONS}
        onChange={(board) => setDraft({ ...draft, board })}
      />
      <TextField
        label="Month"
        type="month"
        width="date"
        value={draft.month}
        errors={submitted && !draft.month ? ["Choose the month."] : undefined}
        onChange={(event) => setDraft({ ...draft, month: event.target.value })}
      />
      <TextField
        label="Keep until"
        type="date"
        width="date"
        hint="After results enquiries and appeals close."
        value={draft.keepUntil}
        errors={
          submitted && !draft.keepUntil
            ? ["Choose the keep-until date."]
            : undefined
        }
        onChange={(event) =>
          setDraft({ ...draft, keepUntil: event.target.value })
        }
      />
      <CheckboxGroupField
        label="Offered"
        value={draft.retired ? ["retired"] : []}
        options={[
          {
            value: "retired",
            label: "Retired",
            hint: "Schools can no longer choose it for new coursework.",
          },
        ]}
        onChange={(value) =>
          setDraft({ ...draft, retired: value.includes("retired") })
        }
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

/**
 * The boards' official sessions and the date their coursework must be kept
 * until. Schools start from these dates and may keep work longer.
 */
function SeriesPage() {
  const { series, changes, names } = Route.useLoaderData();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [opened, setOpened] = useState(0);
  const open = (draft: Draft) => {
    setOpened((count) => count + 1);
    setEditing(draft);
  };
  return (
    <>
      <PageHeader
        title="Exam sessions"
        count={series.length}
        description="Coursework is kept until the date beside its session."
        action={{
          label: "Add a session",
          icon: Plus,
          onClick: () => open(EMPTY),
        }}
      />
      <div className="grid gap-6">
        <DataTable
          caption="Exam sessions"
          rows={series}
          columns={COLUMNS}
          rowLabel={sessionName}
          rowActions={(row) => [
            {
              label: "Change",
              inline: true,
              onSelect: () =>
                open({
                  board: row.board,
                  month: row.sitsIn.slice(0, 7),
                  keepUntil: row.keepUntil,
                  retired: row.retired,
                }),
            },
          ]}
          card={{
            title: (row) => sessionName(row),
            fact: (row) => `Keep until ${formatDay(row.keepUntil)}`,
          }}
          empty={{
            icon: CalendarClock,
            title: "Add the first session",
            description: "Schools choose a session for coursework kept for it.",
          }}
        />
        <RecordSection title="History">
          <ChangeList
            changes={changes}
            names={names}
            subjectName={(change) => {
              const row = series.find((one) => one.id === change.subjectId);
              return row ? sessionName(row) : change.subjectId;
            }}
          />
        </RecordSection>
      </div>
      <SessionSheet
        key={opened}
        series={series}
        draft={editing}
        onClose={() => setEditing(null)}
      />
    </>
  );
}
