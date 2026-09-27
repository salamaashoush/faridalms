import type {
  CheckView,
  LessonResponse,
  StudentBlock,
} from "@faridalms/domain/learning";
import type { FormEvent, ReactNode } from "react";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Radio } from "@base-ui/react/radio";
import { parseNumber } from "@faridalms/domain/answers";
import { useMutation } from "@tanstack/react-query";
import { Check, CircleCheck, CircleX, Eye, Lightbulb } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { RadioGroup } from "~/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";
import { formatList, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

/** Where a question's answers go: the server for a student, local marking in a teacher's preview. */
export interface CheckDriver {
  respond: (blockId: string, response: LessonResponse) => Promise<unknown>;
  reveal: (blockId: string) => Promise<unknown>;
}

type Of<T extends StudentBlock["type"]> = Extract<StudentBlock, { type: T }>;
export type CheckStudentBlock =
  | Of<"choice">
  | Of<"text">
  | Of<"gaps">
  | Of<"number">
  | Of<"written">;

export const isCheckBlock = (block: StudentBlock): block is CheckStudentBlock =>
  block.type === "choice" ||
  block.type === "text" ||
  block.type === "gaps" ||
  block.type === "number" ||
  block.type === "written";

/** Answered right, answer shown, or for a written answer, sent. */
export const isSettled = (
  block: CheckStudentBlock,
  view: CheckView | undefined,
) =>
  view !== undefined &&
  (block.type === "written" ? view.tries > 0 : view.correct || view.revealed);

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

function useCheck(
  blockId: string,
  view: CheckView | undefined,
  driver: CheckDriver,
) {
  const [editing, setEditing] = useState(!view || view.tries === 0);
  const respond = useMutation({
    mutationFn: (response: LessonResponse) => driver.respond(blockId, response),
    onSuccess: () => setEditing(false),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const reveal = useMutation({
    mutationFn: () => driver.reveal(blockId),
    onSuccess: () => setEditing(false),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return { editing, setEditing, respond, reveal };
}

function Verdict({ view }: { view: CheckView }) {
  if (view.correct)
    return (
      <p className="inline-flex items-center gap-2 text-sm leading-5 font-medium text-success">
        <CircleCheck aria-hidden className="size-4" />
        {m.lrnRight()}
      </p>
    );
  if (view.revealed)
    return (
      <p className="inline-flex items-center gap-2 text-sm leading-5 font-medium text-muted-foreground">
        <Eye aria-hidden className="size-4" />
        {m.lrnAnswerShown()}
      </p>
    );
  return (
    <p className="inline-flex flex-wrap items-center gap-x-2 text-sm leading-5 font-medium text-destructive">
      <CircleX aria-hidden className="size-4" />
      {m.lrnNotQuite()}
      {view.triesLeft !== null ? (
        <span className="font-normal text-muted-foreground">
          {m.lrnTriesLeft({ count: view.triesLeft })}
        </span>
      ) : null}
    </p>
  );
}

/** What a student learns from a try: right or not, what they chose meant, a hint, and once settled the answer and why. */
function Outcome({ view, keyText }: { view: CheckView; keyText?: string }) {
  return (
    <>
      <Verdict view={view} />
      {view.feedback.map((text) => (
        <p key={text} dir="auto" className="text-sm leading-6">
          {text}
        </p>
      ))}
      {view.hint ? (
        <p className="flex gap-2 rounded-md bg-muted/60 px-3 py-2 text-sm leading-6">
          <Lightbulb
            aria-hidden
            className="mt-1 size-4 shrink-0 text-muted-foreground"
          />
          <span>
            <span className="font-medium">{m.lrnHint()}</span>{" "}
            <span dir="auto">{view.hint}</span>
          </span>
        </p>
      ) : null}
      {keyText && !view.correct ? (
        <p className="text-sm leading-6">
          <span className="font-medium">{m.lrnCorrectAnswer()}</span>{" "}
          <bdi>{keyText}</bdi>
        </p>
      ) : null}
      {view.explanation ? (
        <p dir="auto" className="text-sm leading-6 text-muted-foreground">
          {view.explanation}
        </p>
      ) : null}
    </>
  );
}

function CheckCard({
  block,
  onSubmit,
  legendId,
  children,
  status,
  actions,
}: {
  block: CheckStudentBlock;
  onSubmit?: () => void;
  legendId: string;
  children: ReactNode;
  status: ReactNode;
  actions: ReactNode;
}) {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit?.();
  };
  return (
    <form onSubmit={submit} className="rounded-lg border bg-card p-5">
      <fieldset aria-labelledby={legendId} className="grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <p
            id={legendId}
            dir="auto"
            className="text-base leading-6 font-semibold"
          >
            {block.prompt}
          </p>
          {block.points > 0 ? (
            <span className="mt-0.5 shrink-0 text-[13px] leading-[18px] text-muted-foreground tabular-nums">
              {m.lrnPoints({ count: block.points })}
            </span>
          ) : null}
        </div>
        {children}
        <div className="flex flex-col">
          <output className="grid gap-2 not-empty:mb-4">{status}</output>
          {actions ? (
            <div className="flex flex-wrap gap-2">{actions}</div>
          ) : null}
        </div>
      </fieldset>
    </form>
  );
}

/** Try again, or give up and see the answer, once a try was wrong. */
function Retry({
  view,
  editing,
  settled,
  canCheck,
  pending,
  onTryAgain,
  onReveal,
}: {
  view: CheckView | undefined;
  editing: boolean;
  settled: boolean;
  canCheck: boolean;
  pending: boolean;
  onTryAgain: () => void;
  onReveal: () => void;
}) {
  if (settled) return null;
  return (
    <>
      {/* Distinct keys, or React turns the clicked Try again into the submit
          button before the click's default action runs, sending the old answer. */}
      {editing ? (
        <Button
          key="check"
          type="submit"
          className="max-md:h-10"
          disabled={!canCheck || pending}
        >
          {m.lrnCheck()}
        </Button>
      ) : (
        <Button
          key="retry"
          type="button"
          variant="outline"
          className="max-md:h-10"
          onClick={onTryAgain}
        >
          {m.lrnTryAgain()}
        </Button>
      )}
      {view && view.tries > 0 ? (
        <Button
          type="button"
          variant="ghost"
          className="max-md:h-10"
          disabled={pending}
          onClick={onReveal}
        >
          <Eye aria-hidden />
          {m.lrnShowAnswer()}
        </Button>
      ) : null}
    </>
  );
}

const choiceRow =
  "group flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-start text-sm leading-5 outline-none transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-disabled:cursor-default data-disabled:hover:bg-transparent";

type Mark = "right" | "wrong" | null;

function MarkIcon({ mark }: { mark: Mark }) {
  if (mark === null) return null;
  const Icon = mark === "right" ? CircleCheck : CircleX;
  return (
    <>
      <Icon
        aria-hidden
        className={cn(
          "size-4 shrink-0",
          mark === "right" ? "text-success" : "text-destructive",
        )}
      />
      <span className="sr-only">
        {mark === "right" ? m.lrnRight() : m.lrnNotQuite()}
      </span>
    </>
  );
}

const markRow = (editing: boolean, mark: Mark) =>
  cn(
    editing && "data-checked:border-primary/50 data-checked:bg-primary/5",
    mark === "right" && "border-success/40 bg-success/10",
    mark === "wrong" && "border-destructive/40 bg-destructive/5",
  );

function ChoiceCheck({
  block,
  view,
  driver,
}: {
  block: Of<"choice">;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const legend = useId();
  const { editing, setEditing, respond, reveal } = useCheck(
    block.id,
    view,
    driver,
  );
  const [selected, setSelected] = useState<string[]>(
    view?.response?.type === "choice" ? view.response.optionIds : [],
  );
  const settled = isSettled(block, view);
  const markOf = (optionId: string): Mark => {
    if (editing || !view) return null;
    if (view.key) {
      if (view.key.includes(optionId)) return "right";
      return selected.includes(optionId) ? "wrong" : null;
    }
    // Before the answer is out, a single choice may say its pick was wrong; a
    // multiple one may not, or the marks would give the answer away.
    return !block.multiple && selected.includes(optionId) && view.tries > 0
      ? "wrong"
      : null;
  };
  const check = () => {
    if (selected.length > 0)
      respond.mutate({ type: "choice", optionIds: selected });
  };
  const locked = !editing || settled;
  return (
    <CheckCard
      block={block}
      legendId={legend}
      onSubmit={check}
      status={
        view && !editing && (view.tries > 0 || view.revealed) ? (
          <Outcome view={view} />
        ) : null
      }
      actions={
        <Retry
          view={view}
          editing={editing}
          settled={settled}
          canCheck={selected.length > 0}
          pending={respond.isPending || reveal.isPending}
          onTryAgain={() => {
            setSelected([]);
            setEditing(true);
          }}
          onReveal={() => reveal.mutate()}
        />
      }
    >
      {block.multiple ? (
        <div className="grid gap-2">
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {m.lrnChooseAll()}
          </p>
          {block.options.map((option) => (
            <CheckboxPrimitive.Root
              key={option.id}
              disabled={locked}
              checked={selected.includes(option.id)}
              onCheckedChange={(checked) =>
                setSelected((current) =>
                  checked
                    ? [...current, option.id]
                    : current.filter((item) => item !== option.id),
                )
              }
              className={cn(choiceRow, markRow(editing, markOf(option.id)))}
            >
              <span
                aria-hidden
                className="grid size-4 shrink-0 place-items-center rounded-[4px] border border-input group-data-checked:border-primary group-data-checked:bg-primary group-data-checked:text-primary-foreground"
              >
                <CheckboxPrimitive.Indicator>
                  <Check className="size-3.5" />
                </CheckboxPrimitive.Indicator>
              </span>
              <span dir="auto" className="min-w-0 flex-1">
                {option.text}
              </span>
              <MarkIcon mark={markOf(option.id)} />
            </CheckboxPrimitive.Root>
          ))}
        </div>
      ) : (
        <RadioGroup
          aria-labelledby={legend}
          disabled={locked}
          value={selected[0] ?? ""}
          onValueChange={(value) => setSelected([String(value)])}
          className="gap-2"
        >
          {block.options.map((option) => (
            <Radio.Root
              key={option.id}
              value={option.id}
              className={cn(choiceRow, markRow(editing, markOf(option.id)))}
            >
              <span
                aria-hidden
                className="grid size-4 shrink-0 place-items-center rounded-full border border-input group-data-checked:border-primary group-data-checked:bg-primary"
              >
                <Radio.Indicator className="size-2 rounded-full bg-primary-foreground" />
              </span>
              <span dir="auto" className="min-w-0 flex-1">
                {option.text}
              </span>
              <MarkIcon mark={markOf(option.id)} />
            </Radio.Root>
          ))}
        </RadioGroup>
      )}
    </CheckCard>
  );
}

function TypedCheck({
  block,
  view,
  driver,
}: {
  block: Of<"text"> | Of<"number">;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const legend = useId();
  const field = useId();
  const input = useRef<HTMLInputElement>(null);
  const { editing, setEditing, respond, reveal } = useCheck(
    block.id,
    view,
    driver,
  );
  const [text, setText] = useState(
    view?.response?.type === "text" || view?.response?.type === "number"
      ? view.response.text
      : "",
  );
  const settled = isSettled(block, view);
  const numeric = block.type === "number";
  const notNumber = numeric && text.trim() !== "" && parseNumber(text) === null;
  const canCheck = text.trim() !== "" && !notNumber;
  const check = () => {
    if (canCheck) respond.mutate({ type: block.type, text: text.trim() });
  };
  return (
    <CheckCard
      block={block}
      legendId={legend}
      onSubmit={check}
      status={
        view && !editing && (view.tries > 0 || view.revealed) ? (
          <Outcome
            view={view}
            keyText={view.key ? formatList(view.key) : undefined}
          />
        ) : null
      }
      actions={
        <Retry
          view={view}
          editing={editing}
          settled={settled}
          canCheck={canCheck}
          pending={respond.isPending || reveal.isPending}
          onTryAgain={() => {
            setEditing(true);
            requestAnimationFrame(() => input.current?.select());
          }}
          onReveal={() => reveal.mutate()}
        />
      }
    >
      <div className="grid gap-1.5">
        <label htmlFor={field} className="sr-only">
          {m.lrnYourAnswer()}
        </label>
        <Input
          ref={input}
          id={field}
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={!editing || settled}
          autoComplete="off"
          spellCheck={false}
          maxLength={numeric ? 60 : 500}
          dir={numeric ? "ltr" : "auto"}
          inputMode={numeric ? "decimal" : undefined}
          aria-invalid={notNumber || undefined}
          aria-describedby={notNumber ? `${field}-error` : undefined}
          placeholder={m.lrnYourAnswer()}
          className={cn(
            "max-md:h-10",
            numeric ? "w-48 tabular-nums" : "w-full max-w-md",
            !editing &&
              view &&
              (view.correct ? "border-success/60" : "border-destructive/50"),
          )}
        />
        {notNumber ? (
          <p
            id={`${field}-error`}
            className="text-[13px] leading-[18px] text-destructive"
          >
            {m.lrnNumberNeeded()}
          </p>
        ) : null}
      </div>
    </CheckCard>
  );
}

/** A text run's key: the blank before it, since text never follows text. */
const precedingGap = (segments: Of<"gaps">["segments"], index: number) =>
  segments.slice(0, index).findLast((segment) => segment.type === "gap")?.id ??
  "start";

function GapsCheck({
  block,
  view,
  driver,
}: {
  block: Of<"gaps">;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const legend = useId();
  const { editing, setEditing, respond, reveal } = useCheck(
    block.id,
    view,
    driver,
  );
  const [answers, setAnswers] = useState<Record<string, string>>(
    view?.response?.type === "gaps" ? view.response.answers : {},
  );
  const settled = isSettled(block, view);
  const gaps = block.segments.filter((segment) => segment.type === "gap");
  const canCheck = gaps.every((gap) => (answers[gap.id] ?? "").trim() !== "");
  const check = () => {
    if (canCheck) respond.mutate({ type: "gaps", answers });
  };
  const locked = !editing || settled;
  const markOf = (gapId: string): Mark =>
    editing || !view || view.tries === 0 || !(gapId in view.gaps)
      ? null
      : view.gaps[gapId]
        ? "right"
        : "wrong";
  return (
    <CheckCard
      block={block}
      legendId={legend}
      onSubmit={check}
      status={
        view && !editing && (view.tries > 0 || view.revealed) ? (
          <Outcome view={view} />
        ) : null
      }
      actions={
        <Retry
          view={view}
          editing={editing}
          settled={settled}
          canCheck={canCheck}
          pending={respond.isPending || reveal.isPending}
          onTryAgain={() => {
            setAnswers((current) =>
              Object.fromEntries(
                Object.entries(current).filter(
                  ([gapId]) => view?.gaps[gapId] === true,
                ),
              ),
            );
            setEditing(true);
          }}
          onReveal={() => reveal.mutate()}
        />
      }
    >
      <div dir="auto" className="text-base leading-10 whitespace-pre-wrap">
        {block.segments.map((segment, index) => {
          if (segment.type === "text")
            return (
              <span key={`after-${precedingGap(block.segments, index)}`}>
                {segment.text}
              </span>
            );
          const number = gaps.indexOf(segment) + 1;
          const label = m.lrnBlankNumber({ number: formatNumber(number) });
          const mark = markOf(segment.id);
          const right = view?.key?.[number - 1];
          return (
            <span
              key={segment.id}
              className="mx-1 inline-flex items-center gap-1.5 align-middle"
            >
              {segment.options.length > 0 ? (
                <Select
                  value={answers[segment.id] ?? null}
                  onValueChange={(value) => {
                    if (value !== null)
                      setAnswers((current) => ({
                        ...current,
                        [segment.id]: value,
                      }));
                  }}
                  disabled={locked}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label={label}
                    className={cn(
                      "min-w-28",
                      mark === "right" && "border-success/60",
                      mark === "wrong" && "border-destructive/50",
                    )}
                  >
                    <SelectValue placeholder={m.lrnChooseWord()} />
                  </SelectTrigger>
                  <SelectContent>
                    {segment.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  aria-label={label}
                  value={answers[segment.id] ?? ""}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [segment.id]: event.target.value,
                    }))
                  }
                  disabled={locked}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={200}
                  dir="auto"
                  className={cn(
                    "h-8 w-32",
                    mark === "right" && "border-success/60",
                    mark === "wrong" && "border-destructive/50",
                  )}
                />
              )}
              <MarkIcon mark={mark} />
              {mark !== "right" && right !== undefined ? (
                <span className="text-sm leading-5 font-medium text-success">
                  <span className="sr-only">{m.lrnCorrectAnswer()} </span>
                  <bdi>{right}</bdi>
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
    </CheckCard>
  );
}

function WrittenCheck({
  block,
  view,
  driver,
}: {
  block: Of<"written">;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const legend = useId();
  const field = useId();
  const sent = view?.response?.type === "written" ? view.response.text : "";
  const [text, setText] = useState(sent);
  const respond = useMutation({
    mutationFn: () =>
      driver.respond(block.id, { type: "written", text: text.trim() }),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const words = countWords(text);
  const over = block.wordLimit !== null && words > block.wordLimit;
  const marked = view?.marked ?? false;
  const waits = block.points > 0;
  const status =
    !view || view.tries === 0 ? null : marked ? (
      <>
        <p className="inline-flex items-center gap-2 text-sm leading-5 font-medium">
          <CircleCheck aria-hidden className="size-4 text-success" />
          {view.credit !== null
            ? m.lrnMarkedPoints({
                points: formatNumber(view.credit),
                total: formatNumber(block.points),
              })
            : m.lrnMarked()}
        </p>
        {view.markFeedback ? (
          <div className="grid gap-1 rounded-md bg-muted/60 px-3 py-2">
            <p className="text-[13px] leading-[18px] font-medium text-muted-foreground">
              {m.lrnTeacherFeedback()}
            </p>
            <p dir="auto" className="text-sm leading-6 whitespace-pre-wrap">
              {view.markFeedback}
            </p>
          </div>
        ) : null}
      </>
    ) : text.trim() === sent.trim() ? (
      <p className="inline-flex items-center gap-2 text-sm leading-5 text-muted-foreground">
        <Check aria-hidden className="size-4" />
        {waits ? m.lrnWaitingMark() : m.lrnAnswerSaved()}
      </p>
    ) : null;
  return (
    <CheckCard
      block={block}
      legendId={legend}
      onSubmit={() => {
        if (text.trim() && !over && text.trim() !== sent.trim())
          respond.mutate();
      }}
      status={status}
      actions={
        marked ? null : (
          <Button
            type="submit"
            className="max-md:h-10"
            disabled={
              !text.trim() ||
              over ||
              text.trim() === sent.trim() ||
              respond.isPending
            }
          >
            {sent ? m.lrnUpdateAnswer() : m.lrnSaveAnswer()}
          </Button>
        )
      }
    >
      <div className="grid gap-1.5">
        <label htmlFor={field} className="sr-only">
          {m.lrnYourAnswer()}
        </label>
        <Textarea
          id={field}
          dir="auto"
          rows={5}
          maxLength={20000}
          value={text}
          readOnly={marked}
          onChange={(event) => setText(event.target.value)}
          aria-invalid={over || undefined}
          aria-describedby={`${field}-count`}
        />
        <p
          id={`${field}-count`}
          className={cn(
            "text-[13px] leading-[18px] text-muted-foreground tabular-nums",
            over && "text-destructive",
          )}
        >
          {block.wordLimit === null
            ? m.lrnWords({ count: words })
            : m.lrnWordsOf({
                count: formatNumber(words),
                limit: formatNumber(block.wordLimit),
              })}
        </p>
      </div>
    </CheckCard>
  );
}

export function CheckBlockView({
  block,
  view,
  driver,
}: {
  block: CheckStudentBlock;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  if (block.type === "choice")
    return <ChoiceCheck block={block} view={view} driver={driver} />;
  if (block.type === "gaps")
    return <GapsCheck block={block} view={view} driver={driver} />;
  if (block.type === "written")
    return <WrittenCheck block={block} view={view} driver={driver} />;
  return <TypedCheck block={block} view={view} driver={driver} />;
}
