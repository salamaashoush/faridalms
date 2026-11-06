import type { TaskRow } from "@faridalms/database/business/tasks";

import { Button } from "@faridalms/ui/button";
import { FormField } from "@faridalms/ui/system/form-field";
import { RecordEmpty, RecordList } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import { Textarea } from "@faridalms/ui/textarea";
import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { failure } from "../actions";
import { formatDay, formatWhen } from "../format";
import { useMay } from "../may";
import { closeTask } from "../server/receivables";

/** A task with the customer it is for. */
export interface TaskListRow {
  task: TaskRow;
  customerName: string;
}

interface CloseTaskProps {
  task: TaskRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Closes a task with what came of the call or the step. */
function CloseTask({ task, open, onOpenChange }: CloseTaskProps) {
  const router = useRouter();
  const close = useServerFn(closeTask);
  const [outcome, setOutcome] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const missing = submitted && !outcome.trim();
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={`Close: ${task.title}`}
      submitLabel="Done"
      pending={pending}
      error={error}
      onSubmit={async () => {
        setSubmitted(true);
        if (!outcome.trim()) return;
        setPending(true);
        setError(null);
        try {
          const out = await close({ data: { id: task.id, outcome } });
          if (out.ok) {
            toast.success("Task done.");
            setOutcome("");
            onOpenChange(false);
            await router.invalidate();
          } else setError(out.message);
        } catch (thrown) {
          setError(failure(thrown, "The task could not be closed."));
        } finally {
          setPending(false);
        }
      }}
    >
      <FormField
        label="What came of it"
        hint="Who you spoke to and what was agreed."
        errors={missing ? ["Say what came of it."] : undefined}
      >
        {(control) => (
          <Textarea
            {...control}
            maxLength={1000}
            rows={4}
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}

interface TaskItemProps {
  row: TaskListRow;
  names: Record<string, string>;
  today: string;
  showCustomer: boolean;
}

function TaskItem({ row, names, today, showCustomer }: TaskItemProps) {
  const { task, customerName } = row;
  const mayClose = useMay("customers");
  const [closing, setClosing] = useState(false);
  const who = (id: string | null) =>
    id ? (names[id] ?? "A former operator") : "Nobody yet";
  const late = !task.doneAt && task.dueOn < today;
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3">
      <div className="grid min-w-0 flex-1 gap-1">
        <span className="text-sm leading-5 font-medium">{task.title}</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] leading-[18px] text-muted-foreground">
          {task.doneAt ? (
            <StatusText tone="success">
              Done {formatWhen(task.doneAt)} · {who(task.doneBy)}
            </StatusText>
          ) : (
            <StatusText tone={late ? "danger" : "info"}>
              {late ? "Overdue since" : "Due"} {formatDay(task.dueOn)} ·{" "}
              {who(task.assigneeId)}
            </StatusText>
          )}
          {showCustomer ? (
            <Link
              to="/customers/$customerId"
              params={{ customerId: task.customerId }}
              className="hover:text-primary hover:underline"
            >
              {customerName}
            </Link>
          ) : null}
          {task.invoiceId ? (
            <Link
              to="/invoices/$invoiceId"
              params={{ invoiceId: task.invoiceId }}
              className="hover:text-primary hover:underline"
            >
              The invoice
            </Link>
          ) : null}
        </div>
        {task.outcome ? (
          <p className="text-sm leading-5">{task.outcome}</p>
        ) : null}
      </div>
      {!task.doneAt && mayClose ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Close ${task.title}`}
            onClick={() => setClosing(true)}
          >
            Close
          </Button>
          <CloseTask task={task} open={closing} onOpenChange={setClosing} />
        </>
      ) : null}
    </li>
  );
}

export interface TaskListProps {
  rows: readonly TaskListRow[];
  names: Record<string, string>;
  today: string;
  /** Names the customer on each task, where the list spans customers. */
  showCustomer?: boolean;
}

/**
 * Tasks for operators, open ones first by when they are due, each with
 * whom it is for. An open task is closed in a sheet, with what came of it.
 */
export function TaskList({
  rows,
  names,
  today,
  showCustomer = false,
}: TaskListProps) {
  if (rows.length === 0) return <RecordEmpty>Nothing to do.</RecordEmpty>;
  return (
    <RecordList>
      {rows.map((row) => (
        <TaskItem
          key={row.task.id}
          row={row}
          names={names}
          today={today}
          showCustomer={showCustomer}
        />
      ))}
    </RecordList>
  );
}
