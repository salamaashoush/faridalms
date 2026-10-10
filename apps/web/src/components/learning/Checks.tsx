import type {
  CheckView,
  LessonResponse,
  ProgramResult,
  ProgramRun,
  StudentBlock,
  StudentPart,
} from "@faridalms/domain/learning";
import type { FormEvent, ReactNode } from "react";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Radio } from "@base-ui/react/radio";
import { parseNumber } from "@faridalms/domain/answers";
import { joinedAroundGaps } from "@faridalms/domain/arabic";
import { textDirection } from "@faridalms/domain/content";
import { MAX_INDENT, MAX_RUN_OUTPUT } from "@faridalms/domain/learning";
import { StoredImage } from "@faridalms/editor/files";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Input } from "@faridalms/ui/input";
import { RadioGroup } from "@faridalms/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@faridalms/ui/select";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CircleCheck,
  CircleX,
  Eye,
  GripVertical,
  IndentDecrease,
  IndentIncrease,
  Lightbulb,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import { createContext, useContext, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import type { RunReport } from "~/components/coding/CodeRunner";

import { CodeRunner } from "~/components/coding/CodeRunner";
import { CodingAnswer } from "~/components/coding/CodingAnswer";
import { friendlyError } from "~/components/coding/friendly";
import { WebProjectAnswer } from "~/components/coding/WebProjectAnswer";
import * as m from "~/i18n/messages";
import { formatList, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { PictureAnswer } from "./PictureAnswer";
import { ReadAloud, YoungContext } from "./ReadAloud";
import { useReorder } from "./reorder";
import { SpokenRecorder, SpokenStatus } from "./SpokenAnswer";
import { YoungCounting } from "./young/YoungCounting";
import { YoungHotspot } from "./young/YoungHotspot";
import { YoungMemory } from "./young/YoungMemory";
import { YoungMatching, YoungOrdering, YoungSorting } from "./young/YoungPlace";
import { YoungSpelling } from "./young/YoungSpelling";
import { YoungTracing } from "./young/YoungTracing";

/** A part's picture over its words; with no words, its description names it. */
function PartView({
  part,
  size = "small",
}: {
  part: StudentPart;
  size?: "small" | "card";
}) {
  const picture = part.picture;
  return (
    <span
      className={cn(
        "flex min-w-0",
        size === "card"
          ? "flex-col items-center gap-2 text-center"
          : "items-center gap-3",
      )}
    >
      {picture ? (
        <StoredImage
          src={`/files/${picture.fileId}`}
          alt={part.text ? "" : picture.alt}
          removed={m.fileRemoved()}
          draggable={false}
          className={cn(
            "shrink-0 rounded-md bg-muted object-contain",
            size === "card" ? "h-28 w-full max-w-40" : "size-12",
          )}
        />
      ) : null}
      {part.text ? (
        <span dir="auto" className="min-w-0">
          {part.text}
        </span>
      ) : null}
    </span>
  );
}

const partLabel = (part: StudentPart) => part.text || part.picture?.alt || "";

/**
 * A part with its speaker beside it. The speaker is a button of its own, so
 * it sits over a choosable card rather than inside it, and playing a part
 * never chooses it.
 */
function Voiced({
  part,
  card,
  children,
}: {
  part: StudentPart;
  card: boolean;
  children: ReactNode;
}) {
  if (!part.narration) return children;
  return (
    <div className="relative">
      {children}
      <ReadAloud
        text={partLabel(part)}
        narration={part.narration}
        size="small"
        className={cn(
          "absolute end-2",
          card ? "top-2" : "top-1/2 -translate-y-1/2",
        )}
      />
    </div>
  );
}

/**
 * How questions behave: practice marks each answer at once, a quiz keeps
 * answers until the whole quiz is handed in, and review shows a handed-in
 * attempt read-only with whatever its marks reveal.
 */
export type CheckMode = "practice" | "quiz" | "review";
export const CheckModeContext = createContext<CheckMode>("practice");
/** Who reads a reviewed answer, so a mark's feedback is addressed to them. */
export const ReviewerContext = createContext<"student" | "teacher">("student");

/** Where a question's answers go: the server for a student, local marking in a teacher's preview. */
export interface CheckDriver {
  respond: (blockId: string, response: LessonResponse) => Promise<unknown>;
  reveal: (blockId: string) => Promise<unknown>;
  /**
   * Keeps an answer's recording or picture somewhere it can be answered with
   * and played or shown from; without it the file is uploaded.
   */
  keepFile?: (file: File) => Promise<{ fileId: string; url: string }>;
  /** Keeps a code exercise's run for the teacher to replay; without it none is kept. */
  ran?: (blockId: string, run: ProgramRun) => void;
}

type Of<T extends StudentBlock["type"]> = Extract<StudentBlock, { type: T }>;
export type CheckStudentBlock =
  | Of<"choice">
  | Of<"text">
  | Of<"gaps">
  | Of<"number">
  | Of<"matching">
  | Of<"ordering">
  | Of<"parsons">
  | Of<"program">
  | Of<"sorting">
  | Of<"counting">
  | Of<"tracing">
  | Of<"spelling">
  | Of<"hotspot">
  | Of<"written">
  | Of<"scratch">
  | Of<"project">;

const CHECK_TYPES = new Set<StudentBlock["type"]>([
  "choice",
  "text",
  "gaps",
  "number",
  "matching",
  "ordering",
  "parsons",
  "program",
  "sorting",
  "counting",
  "tracing",
  "spelling",
  "hotspot",
  "written",
  "scratch",
  "project",
]);

export const isCheckBlock = (block: StudentBlock): block is CheckStudentBlock =>
  CHECK_TYPES.has(block.type);

/** Answered right, answer shown, or for one its teacher marks, sent. */
export const isSettled = (
  block: CheckStudentBlock,
  view: CheckView | undefined,
) =>
  view !== undefined &&
  (block.type === "written" ||
  block.type === "scratch" ||
  block.type === "project"
    ? view.tries > 0
    : view.correct || view.revealed);

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

function useCheck(
  blockId: string,
  view: CheckView | undefined,
  driver: CheckDriver,
) {
  const mode = useContext(CheckModeContext);
  const [editing, setEditing] = useState(
    mode !== "review" && (!view || view.tries === 0),
  );
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
  const mode = useContext(CheckModeContext);
  if (view.correct)
    return (
      <p className="inline-flex items-center gap-2 text-sm leading-5 font-medium text-success">
        <CircleCheck aria-hidden className="size-4" />
        {m.lrnRight()}
      </p>
    );
  // A handed-in quiz shows its answers without anyone asking for them.
  if (mode === "review" && view.fraction > 0)
    return (
      <p className="inline-flex items-center gap-2 text-sm leading-5 font-medium text-warning-foreground dark:text-warning">
        <CircleCheck aria-hidden className="size-4" />
        {m.quizPartlyRight()}
      </p>
    );
  if (view.revealed && mode !== "review")
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

/** What a student learns from a try: right or not, what they chose meant, the hints so far, and once settled the answer and why. */
function Outcome({
  view,
  keyText,
  keyCode,
}: {
  view: CheckView;
  keyText?: string;
  keyCode?: string[];
}) {
  return (
    <>
      <Verdict view={view} />
      {view.feedback.map((text) => (
        <p key={text} dir="auto" className="text-sm leading-6">
          {text}
        </p>
      ))}
      {view.hints.length > 0 ? (
        <div className="grid gap-1.5 rounded-md bg-muted/60 px-3 py-2 text-sm leading-6">
          {view.hints.map((hint, index) => (
            <p key={hint} className="flex gap-2">
              <Lightbulb
                aria-hidden
                className="mt-1 size-4 shrink-0 text-muted-foreground"
              />
              <span>
                <span className="font-medium">
                  {view.hints.length + view.hintsLeft > 1
                    ? m.lrnHintNumber({ number: formatNumber(index + 1) })
                    : m.lrnHint()}
                </span>{" "}
                <span dir="auto">{hint}</span>
              </span>
            </p>
          ))}
          {view.hintsLeft > 0 ? (
            <p className="ps-6 text-muted-foreground">{m.lrnHintNext()}</p>
          ) : null}
        </div>
      ) : null}
      {keyText && !view.correct ? (
        <p className="text-sm leading-6">
          <span className="font-medium">{m.lrnCorrectAnswer()}</span>{" "}
          <bdi>{keyText}</bdi>
        </p>
      ) : null}
      {keyCode && !view.correct ? (
        <div className="grid gap-1.5 text-sm leading-6">
          <p className="font-medium">{m.lrnCorrectAnswer()}</p>
          <pre
            dir="ltr"
            className="overflow-x-auto rounded-md bg-muted/60 px-3 py-2 font-mono text-[13px] leading-5 [font-variant-ligatures:none]"
          >
            <code>{keyCode.join("\n")}</code>
          </pre>
        </div>
      ) : null}
      {view.explanation ? (
        <p dir="auto" className="text-sm leading-6 text-muted-foreground">
          {view.explanation}
        </p>
      ) : null}
    </>
  );
}

/** What a question says under its answer, by mode. */
function CheckStatus({
  view,
  editing,
  keyText,
  keyCode,
}: {
  view: CheckView | undefined;
  editing: boolean;
  keyText?: string;
  keyCode?: string[];
}) {
  const mode = useContext(CheckModeContext);
  if (mode === "review")
    return view && (view.tries > 0 || view.revealed) ? (
      <Outcome view={view} keyText={keyText} keyCode={keyCode} />
    ) : (
      <p className="text-sm leading-5 text-muted-foreground">
        {m.quizNotAnswered()}
      </p>
    );
  if (!view || editing || !(view.tries > 0 || view.revealed)) return null;
  if (mode === "quiz")
    return (
      <p className="inline-flex items-center gap-2 text-sm leading-5 text-muted-foreground">
        <Check aria-hidden className="size-4" />
        {m.quizAnswerKept()}
      </p>
    );
  return <Outcome view={view} keyText={keyText} keyCode={keyCode} />;
}

/** What a question says, read aloud to a young child: its prompt, then its choices. */
function spokenOf(block: CheckStudentBlock): string {
  const parts = [block.prompt];
  if (block.type === "choice") parts.push(...block.options.map(partLabel));
  if (block.type === "ordering" || block.type === "sorting")
    parts.push(...block.items.map(partLabel));
  if (block.type === "gaps")
    parts.push(
      block.segments
        .map((segment) => (segment.type === "text" ? segment.text : " … "))
        .join(""),
    );
  return parts.filter(Boolean).join(". ");
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
  const young = useContext(YoungContext);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit?.();
  };
  return (
    <form onSubmit={submit} className="rounded-lg border bg-card p-5">
      <fieldset aria-labelledby={legendId} className="grid gap-4">
        <div
          // The speaker sits where the question's own text starts.
          dir={young ? (textDirection(block.prompt) ?? undefined) : undefined}
          className="flex items-start justify-between gap-3"
        >
          <ReadAloud
            text={spokenOf(block)}
            narration={block.narration}
            voice={young}
          />
          <p
            id={legendId}
            dir="auto"
            className={cn(
              "min-w-0 flex-1 font-semibold",
              young ? "text-xl leading-8" : "text-base leading-6",
            )}
          >
            {block.prompt}
          </p>
          {/* Young children see no points, only whether they found it. */}
          {block.points > 0 && !young ? (
            <span className="mt-0.5 shrink-0 text-[13px] leading-[18px] text-muted-foreground tabular-nums">
              <bdi>{m.lrnPoints({ count: block.points })}</bdi>
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
  const mode = useContext(CheckModeContext);
  if (mode === "review" || (mode === "practice" && settled)) return null;
  if (mode === "quiz")
    return editing ? (
      <Button
        key="save"
        type="submit"
        className="max-md:h-10"
        disabled={!canCheck || pending}
      >
        {m.quizKeepAnswer()}
      </Button>
    ) : (
      <Button
        key="change"
        type="button"
        variant="outline"
        className="max-md:h-10"
        onClick={onTryAgain}
      >
        {m.quizChangeAnswer()}
      </Button>
    );
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

// Young children press and hold as often as they tap, so a long press must
// choose the option rather than open the system's menu.
const youngRow =
  "min-h-16 text-lg leading-7 select-none [-webkit-touch-callout:none]";

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

/** Right or wrong for one blank, pair or item, once a try is marked and not being redone. */
const partMark = (
  view: CheckView | undefined,
  editing: boolean,
  partId: string,
): Mark =>
  editing || !view || view.tries === 0 || !(partId in view.parts)
    ? null
    : view.parts[partId]
      ? "right"
      : "wrong";

/** Keeps the parts a try got right, so trying again means fixing only the rest. */
const keepRight = (
  answers: Record<string, string>,
  view: CheckView | undefined,
) =>
  Object.fromEntries(
    Object.entries(answers).filter(([partId]) => view?.parts[partId] === true),
  );

const markBorder = (mark: Mark) =>
  cn(
    mark === "right" && "border-success/60",
    mark === "wrong" && "border-destructive/50",
  );

function RightPart({ mark, text }: { mark: Mark; text: string | undefined }) {
  if (mark !== "wrong" || text === undefined) return null;
  return (
    <span className="text-sm leading-5 font-medium text-success">
      <span className="sr-only">{m.lrnCorrectAnswer()} </span>
      <bdi>{text}</bdi>
    </span>
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
  const mode = useContext(CheckModeContext);
  const young = useContext(YoungContext);
  const settled = isSettled(block, view);
  const markOf = (optionId: string): Mark => {
    if (editing || !view || mode === "quiz") return null;
    if (!view.key && view.correct && selected.includes(optionId))
      return "right";
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
  // Options with pictures read as a grid of cards, the way children choose.
  const pictured = block.options.some((option) => option.picture);
  const optionRow = cn(
    choiceRow,
    (young || pictured) && youngRow,
    pictured && "flex-col items-stretch p-3",
  );
  return (
    <CheckCard
      block={block}
      legendId={legend}
      onSubmit={check}
      status={<CheckStatus view={view} editing={editing} />}
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
        <div
          className={cn(
            "grid gap-2",
            pictured && "grid-cols-2 gap-3 sm:grid-cols-3",
          )}
        >
          <p className="col-span-full text-[13px] leading-[18px] text-muted-foreground">
            {m.lrnChooseAll()}
          </p>
          {block.options.map((option) => (
            <Voiced key={option.id} part={option} card={pictured}>
              <CheckboxPrimitive.Root
                disabled={locked}
                checked={selected.includes(option.id)}
                onCheckedChange={(checked) =>
                  setSelected((current) =>
                    checked
                      ? [...current, option.id]
                      : current.filter((item) => item !== option.id),
                  )
                }
                className={cn(
                  optionRow,
                  markRow(editing, markOf(option.id)),
                  option.narration && !pictured && "pe-14",
                )}
                onContextMenu={
                  young ? (event) => event.preventDefault() : undefined
                }
              >
                <span
                  aria-hidden
                  className="grid size-4 shrink-0 place-items-center rounded-[4px] border border-input group-data-checked:border-primary group-data-checked:bg-primary group-data-checked:text-primary-foreground"
                >
                  <CheckboxPrimitive.Indicator>
                    <Check className="size-3.5" />
                  </CheckboxPrimitive.Indicator>
                </span>
                <span className="min-w-0 flex-1">
                  <PartView part={option} size={pictured ? "card" : "small"} />
                </span>
                <MarkIcon mark={markOf(option.id)} />
              </CheckboxPrimitive.Root>
            </Voiced>
          ))}
        </div>
      ) : (
        <RadioGroup
          aria-labelledby={legend}
          disabled={locked}
          value={selected[0] ?? ""}
          onValueChange={(value) => setSelected([String(value)])}
          className={cn(
            "gap-2",
            pictured && "grid grid-cols-2 gap-3 sm:grid-cols-3",
          )}
        >
          {block.options.map((option) => (
            <Voiced key={option.id} part={option} card={pictured}>
              <Radio.Root
                value={option.id}
                className={cn(
                  optionRow,
                  markRow(editing, markOf(option.id)),
                  option.narration && !pictured && "pe-14",
                )}
                onContextMenu={
                  young ? (event) => event.preventDefault() : undefined
                }
              >
                <span
                  aria-hidden
                  className="grid size-4 shrink-0 place-items-center rounded-full border border-input group-data-checked:border-primary group-data-checked:bg-primary"
                >
                  <Radio.Indicator className="size-2 rounded-full bg-primary-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <PartView part={option} size={pictured ? "card" : "small"} />
                </span>
                <MarkIcon mark={markOf(option.id)} />
              </Radio.Root>
            </Voiced>
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
        <CheckStatus
          view={view}
          editing={editing}
          keyText={view?.key ? formatList(view.key) : undefined}
        />
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
  return (
    <CheckCard
      block={block}
      legendId={legend}
      onSubmit={check}
      status={<CheckStatus view={view} editing={editing} />}
      actions={
        <Retry
          view={view}
          editing={editing}
          settled={settled}
          canCheck={canCheck}
          pending={respond.isPending || reveal.isPending}
          onTryAgain={() => {
            setAnswers((current) => keepRight(current, view));
            setEditing(true);
          }}
          onReveal={() => reveal.mutate()}
        />
      }
    >
      <div dir="auto" className="text-base leading-10 whitespace-pre-wrap">
        {joinedAroundGaps(block.segments).map((segment, index) => {
          if (segment.type === "text")
            return (
              <span key={`after-${precedingGap(block.segments, index)}`}>
                {segment.text}
              </span>
            );
          const number = gaps.indexOf(segment) + 1;
          const label = m.lrnBlankNumber({ number: formatNumber(number) });
          const mark = partMark(view, editing, segment.id);
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
                    className={cn("min-w-28", markBorder(mark))}
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
                  className={cn("h-8 w-32", markBorder(mark))}
                />
              )}
              <MarkIcon mark={mark} />
              <RightPart mark={mark} text={view?.partKey?.[segment.id]} />
            </span>
          );
        })}
      </div>
    </CheckCard>
  );
}

function MatchingCheck({
  block,
  view,
  driver,
}: {
  block: Of<"matching">;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const legend = useId();
  const { editing, setEditing, respond, reveal } = useCheck(
    block.id,
    view,
    driver,
  );
  const [pairs, setPairs] = useState<Record<string, string>>(
    view?.response?.type === "matching" ? view.response.pairs : {},
  );
  const settled = isSettled(block, view);
  const canCheck = block.prompts.every((prompt) => pairs[prompt.id]);
  const locked = !editing || settled;
  const items = block.choices.map((choice) => ({
    value: choice.id,
    label: partLabel(choice),
  }));
  return (
    <CheckCard
      block={block}
      legendId={legend}
      onSubmit={() => {
        if (canCheck) respond.mutate({ type: "matching", pairs });
      }}
      status={<CheckStatus view={view} editing={editing} />}
      actions={
        <Retry
          view={view}
          editing={editing}
          settled={settled}
          canCheck={canCheck}
          pending={respond.isPending || reveal.isPending}
          onTryAgain={() => {
            setPairs((current) => keepRight(current, view));
            setEditing(true);
          }}
          onReveal={() => reveal.mutate()}
        />
      }
    >
      <ul className="grid gap-2">
        {block.prompts.map((prompt) => {
          const mark = partMark(view, editing, prompt.id);
          const label = `${legend}-${prompt.id}`;
          return (
            <li
              key={prompt.id}
              className="grid gap-2 rounded-lg border px-4 py-3 sm:grid-cols-2 sm:items-center"
            >
              <span className="flex items-center gap-2">
                <span
                  id={label}
                  className="min-w-0 flex-1 text-sm leading-5 font-medium"
                >
                  <PartView part={prompt} />
                </span>
                <ReadAloud
                  text={partLabel(prompt)}
                  narration={prompt.narration}
                  voice={false}
                  size="small"
                />
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <Select
                  items={items}
                  value={pairs[prompt.id] ?? null}
                  onValueChange={(value) => {
                    if (value !== null)
                      setPairs((current) => ({
                        ...current,
                        [prompt.id]: value,
                      }));
                  }}
                  disabled={locked}
                >
                  <SelectTrigger
                    aria-labelledby={label}
                    className={cn(
                      "w-full min-w-0 max-md:h-10",
                      markBorder(mark),
                    )}
                  >
                    <SelectValue placeholder={m.lrnChooseMatch()} />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <MarkIcon mark={mark} />
              </span>
              {mark === "wrong" && view?.partKey ? (
                <span className="sm:col-start-2">
                  <RightPart mark={mark} text={view.partKey[prompt.id]} />
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </CheckCard>
  );
}

function OrderingCheck({
  block,
  view,
  driver,
}: {
  block: Of<"ordering">;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const legend = useId();
  const { editing, setEditing, respond, reveal } = useCheck(
    block.id,
    view,
    driver,
  );
  const [order, setOrder] = useState<string[]>(
    view?.response?.type === "ordering"
      ? view.response.order
      : block.items.map((item) => item.id),
  );
  const [moved, setMoved] = useState("");
  const settled = isSettled(block, view);
  const locked = !editing || settled;
  const partOf = (itemId: string): StudentPart =>
    block.items.find((item) => item.id === itemId) ?? { id: itemId, text: "" };
  const textOf = (itemId: string) => partLabel(partOf(itemId));
  const moveTo = (index: number, target: number) => {
    if (locked || target < 0 || target >= order.length) return;
    const next = [...order];
    const [itemId] = next.splice(index, 1);
    if (!itemId) return;
    next.splice(target, 0, itemId);
    setOrder(next);
    setMoved(
      m.lrnMovedTo({
        item: textOf(itemId),
        position: formatNumber(target + 1),
        total: formatNumber(order.length),
      }),
    );
  };
  const move = (index: number, by: -1 | 1) => moveTo(index, index + by);
  const reorder = useReorder({ locked, onMove: moveTo });
  return (
    <CheckCard
      block={block}
      legendId={legend}
      onSubmit={() => respond.mutate({ type: "ordering", order })}
      status={
        <CheckStatus
          view={view}
          editing={editing}
          keyText={view?.key ? formatList(view.key) : undefined}
        />
      }
      actions={
        <Retry
          view={view}
          editing={editing}
          settled={settled}
          canCheck
          pending={respond.isPending || reveal.isPending}
          onTryAgain={() => setEditing(true)}
          onReveal={() => reveal.mutate()}
        />
      }
    >
      <div className="grid gap-2">
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.lrnOrderHint()}
        </p>
        <ol className="grid gap-2">
          {order.map((itemId, index) => {
            const mark = partMark(view, editing, itemId);
            const text = textOf(itemId);
            return (
              <li
                key={itemId}
                ref={reorder.row(index)}
                className={cn(
                  "flex min-h-12 items-center gap-3 rounded-lg border bg-background py-1.5 pe-1.5 data-dragging:shadow-lg",
                  locked ? "ps-4" : "ps-1",
                  markBorder(mark),
                )}
              >
                {locked ? null : (
                  // The arrows beside it move the row for those who cannot
                  // drag, so the handle is left out of the tab order.
                  <span
                    aria-hidden
                    title={m.lrnDragToMove()}
                    {...reorder.handle(index)}
                    className="-me-2 flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground select-none hover:bg-muted active:cursor-grabbing max-md:size-11 [&_svg]:size-4"
                  >
                    <GripVertical />
                  </span>
                )}
                <span className="w-5 shrink-0 text-sm text-muted-foreground tabular-nums">
                  {formatNumber(index + 1)}
                </span>
                <span className="min-w-0 flex-1 text-sm leading-5">
                  <PartView part={partOf(itemId)} />
                </span>
                <ReadAloud
                  text={text}
                  narration={partOf(itemId).narration}
                  voice={false}
                  size="small"
                />
                <MarkIcon mark={mark} />
                {locked ? null : (
                  <span className="flex shrink-0">
                    {/* aria-disabled rather than disabled, so focus stays on the
                        button when its item reaches either end. */}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="aria-disabled:opacity-40 max-md:size-10"
                      aria-label={m.lrnMoveItemUp({ item: text })}
                      aria-disabled={index === 0 || undefined}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="aria-disabled:opacity-40 max-md:size-10"
                      aria-label={m.lrnMoveItemDown({ item: text })}
                      aria-disabled={index === order.length - 1 || undefined}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown aria-hidden />
                    </Button>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
        <p aria-live="polite" className="sr-only">
          {moved}
        </p>
      </div>
    </CheckCard>
  );
}

const poolRow =
  "flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-lg border border-dashed px-3 py-2 text-start outline-none transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent max-md:min-h-11";

const codeText =
  "min-w-0 flex-1 font-mono text-[13px] leading-5 whitespace-pre-wrap [font-variant-ligatures:none] [overflow-wrap:anywhere]";

function ParsonsCheck({
  block,
  view,
  driver,
}: {
  block: Of<"parsons">;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const legend = useId();
  const programId = useId();
  const poolId = useId();
  const root = useRef<HTMLDivElement>(null);
  const { editing, setEditing, respond, reveal } = useCheck(
    block.id,
    view,
    driver,
  );
  const [program, setProgram] = useState<{ id: string; indent: number }[]>(
    view?.response?.type === "parsons" ? view.response.lines : [],
  );
  const [said, setSaid] = useState("");
  const settled = isSettled(block, view);
  const locked = !editing || settled;
  const indents = block.language === "python";
  const codeOf = (lineId: string) =>
    block.lines.find((line) => line.id === lineId)?.code ?? "";
  const pool = block.lines.filter(
    (line) => !program.some((placed) => placed.id === line.id),
  );
  // A line's buttons go when it moves between the lists, so focus follows
  // to the line that took its place rather than falling to the page.
  const change = (
    next: typeof program,
    message: string,
    focus: { list: "program" | "pool"; index: number },
  ) => {
    flushSync(() => setProgram(next));
    setSaid(message);
    const targets = [
      ...(root.current?.querySelectorAll<HTMLElement>(
        `[data-parsons="${focus.list}"]`,
      ) ?? []),
    ];
    (
      targets[Math.min(focus.index, targets.length - 1)] ??
      root.current?.querySelector<HTMLElement>("[data-parsons]")
    )?.focus();
  };
  const add = (lineId: string, index: number) => {
    if (locked) return;
    change(
      [...program, { id: lineId, indent: 0 }],
      m.lrnLineAdded({
        line: codeOf(lineId),
        position: formatNumber(program.length + 1),
      }),
      { list: "pool", index },
    );
  };
  const remove = (index: number) => {
    const line = program[index];
    if (locked || !line) return;
    change(
      program.toSpliced(index, 1),
      m.lrnLineRemoved({ line: codeOf(line.id) }),
      { list: "program", index },
    );
  };
  const moveTo = (index: number, target: number) => {
    const line = program[index];
    if (locked || !line || target < 0 || target >= program.length) return;
    setProgram(program.toSpliced(index, 1).toSpliced(target, 0, line));
    setSaid(
      m.lrnMovedTo({
        item: codeOf(line.id),
        position: formatNumber(target + 1),
        total: formatNumber(program.length),
      }),
    );
  };
  const move = (index: number, by: -1 | 1) => moveTo(index, index + by);
  const reorder = useReorder({ locked, onMove: moveTo });
  const indent = (index: number, by: -1 | 1) => {
    const line = program[index];
    if (locked || !line) return;
    const level = Math.min(MAX_INDENT, Math.max(0, line.indent + by));
    if (level === line.indent) return;
    setProgram(program.with(index, { ...line, indent: level }));
    setSaid(
      m.lrnLineIndented({
        line: codeOf(line.id),
        level: formatNumber(level),
      }),
    );
  };
  return (
    <CheckCard
      block={block}
      legendId={legend}
      onSubmit={() => {
        if (program.length > 0)
          respond.mutate({ type: "parsons", lines: program });
      }}
      status={
        <CheckStatus
          view={view}
          editing={editing}
          keyCode={view?.key ?? undefined}
        />
      }
      actions={
        <Retry
          view={view}
          editing={editing}
          settled={settled}
          canCheck={program.length > 0}
          pending={respond.isPending || reveal.isPending}
          onTryAgain={() => setEditing(true)}
          onReveal={() => reveal.mutate()}
        />
      }
    >
      <div ref={root} className="grid gap-4">
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {indents ? m.lrnParsonsHintIndent() : m.lrnParsonsHint()}
        </p>
        <div className="grid gap-2">
          <p
            id={programId}
            className="text-[13px] leading-[18px] font-medium text-muted-foreground"
          >
            {m.lrnYourProgram()}
          </p>
          {program.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-3 text-sm leading-5 text-muted-foreground">
              {m.lrnProgramEmpty()}
            </p>
          ) : (
            <ol aria-labelledby={programId} dir="ltr" className="grid gap-1.5">
              {program.map((line, index) => {
                const mark = partMark(view, editing, line.id);
                const code = codeOf(line.id);
                return (
                  <li
                    key={line.id}
                    ref={reorder.row(index)}
                    className={cn(
                      "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-background py-1 pe-1 data-dragging:shadow-lg",
                      locked ? "ps-3" : "ps-1",
                      markBorder(mark),
                    )}
                  >
                    <span className="flex min-h-8 min-w-48 flex-1 items-center gap-2">
                      {locked ? null : (
                        <span
                          aria-hidden
                          title={m.lrnDragToMove()}
                          {...reorder.handle(index)}
                          className="-me-1 flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground select-none hover:bg-muted active:cursor-grabbing max-md:size-11 [&_svg]:size-4"
                        >
                          <GripVertical />
                        </span>
                      )}
                      <span className="w-5 shrink-0 text-[13px] leading-5 text-muted-foreground tabular-nums">
                        {formatNumber(index + 1)}
                      </span>
                      {indents
                        ? Array.from({ length: line.indent }, (_, level) => (
                            <span
                              key={level}
                              aria-hidden
                              className="w-4 shrink-0 self-stretch border-s border-dashed border-muted-foreground/40"
                            />
                          ))
                        : null}
                      <code className={codeText}>{code}</code>
                      {indents && line.indent > 0 ? (
                        <span className="sr-only">
                          {m.lrnIndentLevel({
                            level: formatNumber(line.indent),
                          })}
                        </span>
                      ) : null}
                      <MarkIcon mark={mark} />
                    </span>
                    {locked ? null : (
                      <span className="ms-auto flex shrink-0">
                        {/* aria-disabled rather than disabled, so focus stays on the
                            button when its line reaches either end. */}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="aria-disabled:opacity-40 max-md:size-10"
                          aria-label={m.lrnMoveItemUp({ item: code })}
                          aria-disabled={index === 0 || undefined}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp aria-hidden />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="aria-disabled:opacity-40 max-md:size-10"
                          aria-label={m.lrnMoveItemDown({ item: code })}
                          aria-disabled={
                            index === program.length - 1 || undefined
                          }
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown aria-hidden />
                        </Button>
                        {indents ? (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="aria-disabled:opacity-40 max-md:size-10"
                              aria-label={m.lrnOutdentLine({ line: code })}
                              aria-disabled={line.indent === 0 || undefined}
                              onClick={() => indent(index, -1)}
                            >
                              <IndentDecrease aria-hidden />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="aria-disabled:opacity-40 max-md:size-10"
                              aria-label={m.lrnIndentLine({ line: code })}
                              aria-disabled={
                                line.indent === MAX_INDENT || undefined
                              }
                              onClick={() => indent(index, 1)}
                            >
                              <IndentIncrease aria-hidden />
                            </Button>
                          </>
                        ) : null}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="max-md:size-10"
                          data-parsons="program"
                          aria-label={m.lrnRemoveLine({ line: code })}
                          onClick={() => remove(index)}
                        >
                          <X aria-hidden />
                        </Button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <div className="grid gap-2">
          <p
            id={poolId}
            className="text-[13px] leading-[18px] font-medium text-muted-foreground"
          >
            {m.lrnLinesToUse()}
          </p>
          {pool.length === 0 ? (
            <p className="text-sm leading-5 text-muted-foreground">
              {m.lrnPoolEmpty()}
            </p>
          ) : (
            <ul aria-labelledby={poolId} dir="ltr" className="grid gap-1.5">
              {pool.map((line, index) => (
                <li key={line.id}>
                  <button
                    type="button"
                    className={poolRow}
                    data-parsons="pool"
                    disabled={locked}
                    aria-label={m.lrnAddLine({ line: line.code })}
                    onClick={() => add(line.id, index)}
                  >
                    <Plus
                      aria-hidden
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                    <code className={codeText}>{line.code}</code>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p aria-live="polite" className="sr-only">
          {said}
        </p>
      </div>
    </CheckCard>
  );
}

const testText =
  "font-mono text-[13px] leading-5 whitespace-pre-wrap [font-variant-ligatures:none] [overflow-wrap:anywhere]";

/** One test of a code exercise: what it gives, what it expects, how it went. */
function ProgramTest({
  title,
  test,
  result,
  language,
}: {
  title: string;
  test: { input: string; expected: string } | null;
  result: ProgramResult | undefined;
  language: "python" | "javascript";
}) {
  const mark: Mark = result ? (result.passed ? "right" : "wrong") : null;
  const friendly = result?.error
    ? friendlyError(language, result.error.split(":")[0] ?? "")
    : null;
  const row = (label: string, text: string, tone?: string) => (
    <>
      <dt dir="auto" className="text-[13px] leading-5 text-muted-foreground">
        {label}
      </dt>
      <dd className={cn(testText, tone)}>
        <bdi dir="ltr">{text}</bdi>
      </dd>
    </>
  );
  return (
    <li
      className={cn(
        "grid gap-1.5 rounded-lg border px-3 py-2",
        markBorder(mark),
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] leading-[18px] font-medium">{title}</span>
        <MarkIcon mark={mark} />
      </div>
      {test || (result && !result.passed) ? (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
          {test?.input ? row(m.codeTestGives(), test.input) : null}
          {test ? row(m.codeTestExpects(), test.expected) : null}
          {result && !result.passed && result.output !== null
            ? row(m.codeTestGot(), result.output || m.codeTestNothing())
            : null}
        </dl>
      ) : null}
      {result && !result.passed && result.stopped ? (
        <p dir="auto" className="text-[13px] leading-5 text-destructive">
          {result.stopped === "time"
            ? m.codeTestStoppedTime()
            : m.codeTestStoppedOutput()}
        </p>
      ) : result?.error ? (
        <>
          <p dir="ltr" className={cn(testText, "text-destructive")}>
            {result.error}
          </p>
          {friendly ? (
            <p
              dir="auto"
              className="text-[13px] leading-5 text-muted-foreground"
            >
              {friendly}
            </p>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

/** A run as its teacher replays it; a runner that failed to start says nothing of the student's. */
function keptRun({ code, input, end, printed }: RunReport): ProgramRun | null {
  if (end.status === "failed") return null;
  const error =
    end.status === "done" && end.error
      ? (end.error.message || end.error.name).slice(0, 500)
      : null;
  return {
    code,
    input: input.slice(0, 4000),
    outcome:
      end.status === "stopped"
        ? end.reason === "asked"
          ? "stopped"
          : end.reason
        : error
          ? "error"
          : "done",
    error,
    output: printed.slice(0, MAX_RUN_OUTPUT),
  };
}

function ProgramCheck({
  block,
  view,
  driver,
}: {
  block: Of<"program">;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const legend = useId();
  const mode = useContext(CheckModeContext);
  const { respond, reveal } = useCheck(block.id, view, driver);
  const last = view?.response?.type === "program" ? view.response : null;
  const [code, setCode] = useState(last?.code ?? block.starter);
  const settled = isSettled(block, view);
  const locked = settled || mode === "review";
  // Results belong to the code they were run on; once it changes they
  // would describe a program the student no longer has.
  const results = last && last.code === code ? (last.results ?? {}) : {};
  const total = block.tests.length + block.hiddenTests.length;
  const passed = Object.values(results).filter((result) => result.passed);
  const canCheck =
    !locked && code.trim() !== "" && (code !== last?.code || !view?.tries);
  return (
    <CheckCard
      block={block}
      legendId={legend}
      onSubmit={() => {
        if (canCheck) respond.mutate({ type: "program", code });
      }}
      status={
        respond.isPending ? (
          <p className="inline-flex items-center gap-2 text-sm leading-5 text-muted-foreground">
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            {m.codeChecking()}
          </p>
        ) : (
          <CheckStatus view={view} editing={false} />
        )
      }
      actions={
        locked ? null : (
          <>
            <Button
              type="submit"
              className="max-md:h-10"
              disabled={!canCheck || respond.isPending || reveal.isPending}
            >
              {mode === "quiz" ? m.quizKeepAnswer() : m.lrnCheck()}
            </Button>
            {mode !== "quiz" && view && view.tries > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="max-md:h-10"
                disabled={respond.isPending || reveal.isPending}
                onClick={() => reveal.mutate()}
              >
                <Eye aria-hidden />
                {m.lrnShowAnswer()}
              </Button>
            ) : null}
          </>
        )
      }
    >
      <CodeRunner
        source={block.starter}
        initial={code}
        language={block.language}
        readOnly={locked}
        onChange={setCode}
        onRan={(report) => {
          const run = keptRun(report);
          if (run) driver.ran?.(block.id, run);
        }}
      />
      <div className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-[13px] leading-[18px] font-medium text-muted-foreground">
            {m.codeTests()}
          </p>
          {passed.length > 0 || Object.keys(results).length > 0 ? (
            <p className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
              {m.codeTestsPassed({
                passed: formatNumber(passed.length),
                total: formatNumber(total),
              })}
            </p>
          ) : null}
        </div>
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {block.language === "javascript"
            ? m.codeTestsHintJs()
            : m.codeTestsHint()}
        </p>
        <ul className="grid gap-1.5">
          {block.tests.map((test, index) => (
            <ProgramTest
              key={test.id}
              title={m.codeTestNumber({ number: formatNumber(index + 1) })}
              test={test}
              result={mode === "quiz" ? undefined : results[test.id]}
              language={block.language}
            />
          ))}
          {block.hiddenTests.map((testId, index) => (
            <ProgramTest
              key={testId}
              title={m.codeHiddenTestNumber({
                number: formatNumber(block.tests.length + index + 1),
              })}
              test={null}
              result={mode === "quiz" ? undefined : results[testId]}
              language={block.language}
            />
          ))}
        </ul>
      </div>
    </CheckCard>
  );
}

const groupChip =
  "min-h-8 cursor-pointer rounded-full border px-3 py-1 text-[13px] leading-5 outline-none transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-disabled:cursor-default data-disabled:hover:bg-transparent data-disabled:data-checked:hover:bg-primary max-md:min-h-10";

function SortingCheck({
  block,
  view,
  driver,
}: {
  block: Of<"sorting">;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const legend = useId();
  const { editing, setEditing, respond, reveal } = useCheck(
    block.id,
    view,
    driver,
  );
  const [groups, setGroups] = useState<Record<string, string>>(
    view?.response?.type === "sorting" ? view.response.groups : {},
  );
  const settled = isSettled(block, view);
  const canCheck = block.items.every((item) => groups[item.id]);
  const locked = !editing || settled;
  return (
    <CheckCard
      block={block}
      legendId={legend}
      onSubmit={() => {
        if (canCheck) respond.mutate({ type: "sorting", groups });
      }}
      status={<CheckStatus view={view} editing={editing} />}
      actions={
        <Retry
          view={view}
          editing={editing}
          settled={settled}
          canCheck={canCheck}
          pending={respond.isPending || reveal.isPending}
          onTryAgain={() => {
            setGroups((current) => keepRight(current, view));
            setEditing(true);
          }}
          onReveal={() => reveal.mutate()}
        />
      }
    >
      <ul className="grid gap-2">
        {block.items.map((item) => {
          const mark = partMark(view, editing, item.id);
          const label = `${legend}-${item.id}`;
          return (
            <li
              key={item.id}
              className={cn(
                "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border px-4 py-3",
                markBorder(mark),
              )}
            >
              <span className="flex items-center gap-2">
                <span id={label} className="text-sm leading-5 font-medium">
                  <PartView part={item} />
                </span>
                <ReadAloud
                  text={partLabel(item)}
                  narration={item.narration}
                  voice={false}
                  size="small"
                />
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <RadioGroup
                  aria-labelledby={label}
                  value={groups[item.id] ?? ""}
                  onValueChange={(value) =>
                    setGroups((current) => ({
                      ...current,
                      [item.id]: String(value),
                    }))
                  }
                  disabled={locked}
                  className="flex w-auto flex-wrap gap-1.5"
                >
                  {block.groups.map((group) => (
                    <Radio.Root
                      key={group.id}
                      value={group.id}
                      className={groupChip}
                    >
                      <bdi>{group.name}</bdi>
                    </Radio.Root>
                  ))}
                </RadioGroup>
                <MarkIcon mark={mark} />
                <RightPart mark={mark} text={view?.partKey?.[item.id]} />
              </span>
            </li>
          );
        })}
      </ul>
    </CheckCard>
  );
}

/** A question answered by speaking: the student records, listens and sends. */
function SpokenCheck({
  block,
  view,
  driver,
}: {
  block: Of<"written">;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const mode = useContext(CheckModeContext);
  const locked = (view?.marked ?? false) || mode === "review";
  return (
    <CheckCard
      block={block}
      legendId={useId()}
      status={<SpokenStatus block={block} view={view} />}
      actions={null}
    >
      <SpokenRecorder
        block={block}
        view={view}
        driver={driver}
        locked={locked}
      />
    </CheckCard>
  );
}

/** A question answered with a drawing or a photo, looked at by the teacher. */
function PictureCheck({
  block,
  view,
  driver,
}: {
  block: Of<"written">;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const mode = useContext(CheckModeContext);
  const young = useContext(YoungContext);
  return (
    <CheckCard
      block={block}
      legendId={useId()}
      status={<SpokenStatus block={block} view={view} />}
      actions={null}
    >
      <PictureAnswer
        block={block}
        view={view}
        driver={driver}
        young={young}
        locked={(view?.marked ?? false) || mode === "review"}
      />
    </CheckCard>
  );
}

function CodingCheck({
  block,
  view,
  driver,
}: {
  block: Of<"scratch">;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const mode = useContext(CheckModeContext);
  return (
    <CheckCard
      block={block}
      legendId={useId()}
      status={<SpokenStatus block={block} view={view} />}
      actions={null}
    >
      <CodingAnswer
        block={block}
        view={view}
        driver={driver}
        locked={(view?.marked ?? false) || mode === "review"}
      />
    </CheckCard>
  );
}

function ProjectCheck({
  block,
  view,
  driver,
}: {
  block: Of<"project">;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const mode = useContext(CheckModeContext);
  return (
    <CheckCard
      block={block}
      legendId={useId()}
      // A quiz hands every answer in together, so nothing is sent yet.
      status={
        mode === "quiz" ? null : <SpokenStatus block={block} view={view} />
      }
      actions={null}
    >
      <WebProjectAnswer
        block={block}
        view={view}
        driver={driver}
        mode={mode}
        locked={(view?.marked ?? false) || mode === "review"}
      />
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
  const mode = useContext(CheckModeContext);
  const reviewer = useContext(ReviewerContext);
  const words = countWords(text);
  const over = block.wordLimit !== null && words > block.wordLimit;
  const marked = view?.marked ?? false;
  const locked = marked || mode === "review";
  const waits = block.points > 0;
  const status =
    !view || view.tries === 0 ? (
      mode === "review" ? (
        <p className="text-sm leading-5 text-muted-foreground">
          {m.quizNotAnswered()}
        </p>
      ) : null
    ) : marked ? (
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
              {reviewer === "teacher"
                ? m.lrnFeedbackLabel()
                : m.lrnTeacherFeedback()}
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
        {mode === "quiz"
          ? m.quizAnswerKept()
          : waits
            ? m.lrnWaitingMark()
            : m.lrnAnswerSaved()}
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
        locked ? null : (
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
            {mode === "quiz"
              ? m.quizKeepAnswer()
              : sent
                ? m.lrnUpdateAnswer()
                : m.lrnSaveAnswer()}
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
          readOnly={locked}
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

/** Whether a question's cards are placed by tapping them into place, as children do. */
const placesCards = (block: CheckStudentBlock, young: boolean) => {
  const parts =
    block.type === "matching"
      ? [...block.prompts, ...block.choices]
      : block.type === "sorting" || block.type === "ordering"
        ? block.items
        : null;
  return parts !== null && (young || parts.some((part) => part.picture));
};

export function CheckBlockView({
  block,
  view,
  driver,
}: {
  block: CheckStudentBlock;
  view: CheckView | undefined;
  driver: CheckDriver;
}) {
  const young = useContext(YoungContext);
  const mode = useContext(CheckModeContext);
  const legend = useId();
  if (block.type === "counting")
    return (
      <CheckCard block={block} legendId={legend} status={null} actions={null}>
        <YoungCounting block={block} view={view} driver={driver} />
      </CheckCard>
    );
  if (block.type === "matching" && block.memory && mode === "practice")
    return (
      <CheckCard block={block} legendId={legend} status={null} actions={null}>
        <YoungMemory block={block} view={view} driver={driver} />
      </CheckCard>
    );
  if (block.type === "spelling")
    return (
      <CheckCard block={block} legendId={legend} status={null} actions={null}>
        <YoungSpelling block={block} view={view} driver={driver} />
      </CheckCard>
    );
  if (block.type === "hotspot")
    return (
      <CheckCard block={block} legendId={legend} status={null} actions={null}>
        <YoungHotspot block={block} view={view} driver={driver} />
      </CheckCard>
    );
  if (block.type === "tracing")
    return (
      <CheckCard block={block} legendId={legend} status={null} actions={null}>
        <YoungTracing block={block} view={view} driver={driver} />
      </CheckCard>
    );
  // A quiz keeps answers unmarked until hand-in, which placing cannot do.
  if (mode === "practice" && placesCards(block, young)) {
    const board =
      block.type === "matching" ? (
        <YoungMatching block={block} view={view} driver={driver} />
      ) : block.type === "sorting" ? (
        <YoungSorting block={block} view={view} driver={driver} />
      ) : block.type === "ordering" ? (
        <YoungOrdering block={block} view={view} driver={driver} />
      ) : null;
    return (
      <CheckCard block={block} legendId={legend} status={null} actions={null}>
        {board}
      </CheckCard>
    );
  }
  if (block.type === "choice")
    return <ChoiceCheck block={block} view={view} driver={driver} />;
  if (block.type === "gaps")
    return <GapsCheck block={block} view={view} driver={driver} />;
  if (block.type === "written" && block.recordSeconds)
    return <SpokenCheck block={block} view={view} driver={driver} />;
  if (block.type === "written" && block.answerWith)
    return <PictureCheck block={block} view={view} driver={driver} />;
  if (block.type === "written")
    return <WrittenCheck block={block} view={view} driver={driver} />;
  if (block.type === "scratch")
    return <CodingCheck block={block} view={view} driver={driver} />;
  if (block.type === "project")
    return <ProjectCheck block={block} view={view} driver={driver} />;
  if (block.type === "matching")
    return <MatchingCheck block={block} view={view} driver={driver} />;
  if (block.type === "ordering")
    return <OrderingCheck block={block} view={view} driver={driver} />;
  if (block.type === "parsons")
    return <ParsonsCheck block={block} view={view} driver={driver} />;
  if (block.type === "program")
    return <ProgramCheck block={block} view={view} driver={driver} />;
  if (block.type === "sorting")
    return <SortingCheck block={block} view={view} driver={driver} />;
  return <TypedCheck block={block} view={view} driver={driver} />;
}
