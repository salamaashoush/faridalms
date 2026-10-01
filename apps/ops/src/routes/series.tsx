import type { ExamBoard, ExamSeries } from "@faridalms/domain/exams";

import { EXAM_BOARDS, seriesId } from "@faridalms/domain/exams";
import { Badge } from "@faridalms/ui/badge";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { Input } from "@faridalms/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@faridalms/ui/table";
import { Textarea } from "@faridalms/ui/textarea";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { ChangeList } from "../components/ChangeList";
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

function SeriesPage() {
  const { series, changes } = Route.useLoaderData();
  const router = useRouter();
  const save = useServerFn(saveSeries);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const existing = draft.month
    ? series.find(
        (row) => row.id === seriesId(draft.board, `${draft.month}-01`),
      )
    : undefined;
  const edit = (row: ExamSeries) => {
    setDraft({
      board: row.board,
      month: row.sitsIn.slice(0, 7),
      keepUntil: row.keepUntil,
      retired: row.retired,
    });
    document.getElementById("series-form")?.scrollIntoView();
  };
  return (
    <div className="grid gap-8">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">Exam sessions</h1>
        <p className="text-sm text-muted-foreground">
          The boards' official sessions and the date their coursework must be
          kept until, after results enquiries and appeals close. Schools start
          from these dates and may keep work longer.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session</TableHead>
              <TableHead className="max-sm:hidden">Keep until</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {series.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-normal">
                  <span className="font-medium">{sessionName(row)}</span>
                  {row.retired ? (
                    <Badge variant="secondary" className="ms-2">
                      Retired
                    </Badge>
                  ) : null}
                  <div className="text-xs text-muted-foreground">{row.id}</div>
                  <div className="text-xs sm:hidden">
                    Keep until {formatDay(row.keepUntil)}
                  </div>
                </TableCell>
                <TableCell className="max-sm:hidden">
                  {formatDay(row.keepUntil)}
                </TableCell>
                <TableCell className="text-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Change ${sessionName(row)}`}
                    onClick={() => edit(row)}
                  >
                    Change
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <form
        id="series-form"
        className="grid max-w-2xl gap-6 rounded-lg border p-6"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!draft.month || !draft.keepUntil) {
            toast.error("Choose the month and the keep-until date.");
            return;
          }
          if (!reason.trim()) {
            toast.error("Say why, for the change log.");
            return;
          }
          setSaving(true);
          try {
            await save({
              data: {
                board: draft.board,
                sitsIn: `${draft.month}-01`,
                keepUntil: draft.keepUntil,
                retired: draft.retired,
                reason: reason.trim(),
              },
            });
            setDraft(EMPTY);
            setReason("");
            toast.success("Session saved. Cells see it within a minute.");
            await router.invalidate();
          } catch {
            toast.error(
              "The session could not be saved. Keep-until must come after the session.",
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="grid gap-1">
          <h2 className="text-base font-semibold">
            {existing ? `Change ${sessionName(existing)}` : "Add a session"}
          </h2>
          <p className="text-sm text-muted-foreground">
            A board and month name one session; choosing one already listed
            changes it.
          </p>
        </div>
        <div className="grid items-start gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5 text-sm">
            <label htmlFor="series-board" className="font-medium">
              Board
            </label>
            <select
              id="series-board"
              value={draft.board}
              onChange={(event) =>
                setDraft({ ...draft, board: event.target.value as ExamBoard })
              }
              className="h-9 w-full min-w-0 rounded-md border bg-background px-2 text-sm"
            >
              {EXAM_BOARDS.map((board) => (
                <option key={board} value={board}>
                  {BOARD_NAMES[board]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5 text-sm">
            <label htmlFor="series-month" className="font-medium">
              Month
            </label>
            <Input
              id="series-month"
              type="month"
              value={draft.month}
              onChange={(event) =>
                setDraft({ ...draft, month: event.target.value })
              }
            />
          </div>
          <div className="grid gap-1.5 text-sm">
            <label htmlFor="series-keep" className="font-medium">
              Keep until
            </label>
            <Input
              id="series-keep"
              type="date"
              value={draft.keepUntil}
              onChange={(event) =>
                setDraft({ ...draft, keepUntil: event.target.value })
              }
            />
          </div>
        </div>
        <span className="flex items-center gap-2 text-sm">
          <Checkbox
            id="series-retired"
            checked={draft.retired}
            onCheckedChange={(checked) =>
              setDraft({ ...draft, retired: checked })
            }
          />
          <label htmlFor="series-retired">
            Retired: schools can no longer choose it for new coursework
          </label>
        </span>
        <div className="grid gap-1.5 text-sm">
          <label htmlFor="series-reason" className="font-medium">
            Why
          </label>
          <Textarea
            id="series-reason"
            required
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="For example: dates from the board's 2027 handbook, section 7"
          />
        </div>
        <span className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : existing ? "Save changes" : "Add session"}
          </Button>
          {draft !== EMPTY ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDraft(EMPTY)}
            >
              Clear
            </Button>
          ) : null}
        </span>
      </form>
      <section className="grid gap-3">
        <h2 className="text-base font-semibold">History</h2>
        <ChangeList changes={changes} subjectName={(id) => id} />
      </section>
    </div>
  );
}
