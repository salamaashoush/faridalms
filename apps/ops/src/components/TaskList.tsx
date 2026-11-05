import type { TaskRow } from "@faridalms/database/business/tasks";

import { Button } from "@faridalms/ui/button";
import { Textarea } from "@faridalms/ui/textarea";
import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { failure } from "../actions";
import { formatDay, formatWhen } from "../format";
import { useMay } from "../may";
import { closeTask } from "../server/receivables";

/** Closes a task with what came of the call or the step. */
function DoneForm({ task }: { task: TaskRow }) {
  const router = useRouter();
  const close = useServerFn(closeTask);
  const [outcome, setOutcome] = useState("");
  const [saving, setSaving] = useState(false);
  const id = `task-outcome-${task.id}`;
  return (
    <form
      aria-label={`Close: ${task.title}`}
      className="grid gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
          const out = await close({ data: { id: task.id, outcome } });
          if (out.ok) {
            toast.success("Task done.");
            setOutcome("");
            await router.invalidate();
          } else toast.error(out.message);
        } catch (error) {
          const said = failure(error, "The task could not be closed.");
          if (said) toast.error(said);
        } finally {
          setSaving(false);
        }
      }}
    >
      <label htmlFor={id} className="text-sm font-medium">
        What came of it
      </label>
      <Textarea
        id={id}
        required
        maxLength={1000}
        rows={2}
        value={outcome}
        onChange={(event) => setOutcome(event.target.value)}
        placeholder="Who you spoke to and what was agreed"
      />
      <Button
        type="submit"
        size="sm"
        variant="outline"
        disabled={saving}
        className="justify-self-start"
      >
        {saving ? "Saving…" : "Done"}
      </Button>
    </form>
  );
}

/**
 * Tasks for operators, open ones first by when they are due, each with
 * whom it is for and, while open, a form to close it with what came of it.
 */
export function TaskList({
  rows,
  names,
  today,
  showCustomer = false,
}: {
  rows: readonly { task: TaskRow; customerName: string }[];
  names: Record<string, string>;
  today: string;
  showCustomer?: boolean;
}) {
  const mayClose = useMay("customers");
  if (rows.length === 0)
    return <p className="text-sm text-muted-foreground">Nothing to do.</p>;
  return (
    <ul className="divide-y rounded-lg border text-sm">
      {rows.map(({ task, customerName }) => (
        <li key={task.id} className="grid gap-2 px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">{task.title}</span>
            <span className="text-xs text-muted-foreground">
              {task.doneAt
                ? `Done ${formatWhen(task.doneAt)} · ${names[task.doneBy ?? ""] ?? "A former operator"}`
                : `${task.dueOn < today ? "Overdue since" : "Due"} ${formatDay(task.dueOn)} · ${
                    task.assigneeId
                      ? (names[task.assigneeId] ?? "A former operator")
                      : "Nobody yet"
                  }`}
            </span>
          </div>
          {showCustomer || task.invoiceId ? (
            <p className="flex flex-wrap gap-3 text-muted-foreground">
              {showCustomer ? (
                <Link
                  to="/customers/$customerId"
                  params={{ customerId: task.customerId }}
                  className="underline"
                >
                  {customerName}
                </Link>
              ) : null}
              {task.invoiceId ? (
                <Link
                  to="/invoices/$invoiceId"
                  params={{ invoiceId: task.invoiceId }}
                  className="underline"
                >
                  The invoice
                </Link>
              ) : null}
            </p>
          ) : null}
          {task.outcome ? <p>{task.outcome}</p> : null}
          {!task.doneAt && mayClose ? <DoneForm task={task} /> : null}
        </li>
      ))}
    </ul>
  );
}
