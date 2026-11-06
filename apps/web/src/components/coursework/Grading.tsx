import type { Rubric } from "@faridalms/domain/coursework";

import { contentPlainText, wordsAt } from "@faridalms/domain/content";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@faridalms/ui/combobox";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@faridalms/ui/sheet";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { PageActions } from "@faridalms/ui/system/page-actions";
import { RecordEmpty } from "@faridalms/ui/system/record-page";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  PenLine,
  Plus,
  Send,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { toolGrading } from "~/components/content/lti";
import { CourseworkStanding } from "~/components/exams/Authentication";
import { FileList } from "~/components/system/FileList";
import { useMedia } from "~/hooks/useMedia";
import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { gradingQuery } from "~/queries/coursework";
import { workStandingQuery } from "~/queries/exams";
import { actOnWork, assessAttempt, showHeldGrade } from "~/server/coursework";
import { formatInstant, formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { resultText } from "../grading/format";
import { displayName } from "../people/format";
import { CommentBankPicker } from "./CommentBank";
import { DiscussionPosts } from "./Discussion";
import { StudentPeerReviews } from "./PeerReview";
import { QuizAttempts } from "./QuizWork";
import { VoiceFeedback } from "./VoiceFeedback";
import { CommentedWork, CommentList } from "./WorkComments";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof gradingQuery>["queryFn"]>>
>;

function levelTotal(rubric: Rubric, scores: Record<string, string>) {
  return rubric.criteria.reduce((sum, criterion) => {
    const level = criterion.levels.find(
      (row) => row.id === scores[criterion.id],
    );
    return sum + (level?.points ?? 0);
  }, 0);
}

type QueueRow = Data["queue"][number];
type Standing = "answered" | "to_grade" | "returned" | "not_in" | "excused";

const STANDINGS: Standing[] = [
  "answered",
  "to_grade",
  "returned",
  "not_in",
  "excused",
];

const STANDING_LABEL: Record<Standing, (count: { count: string }) => string> = {
  answered: m.courseworkQueueAnswered,
  to_grade: m.courseworkQueueToGrade,
  returned: m.courseworkQueueReturned,
  not_in: m.courseworkQueueNotIn,
  excused: m.courseworkQueueExcused,
};

function standingOf(row: QueueRow): Standing {
  // A student waiting on a reply comes first, whatever else is due.
  if (row.awaiting > 0) return "answered";
  if (row.excused) return "excused";
  if (row.needsGrading) return "to_grade";
  if (row.handedIn) return "returned";
  return "not_in";
}

interface StudentSwitcherProps {
  data: Data;
  onGo: (studentId: string) => void;
}

/**
 * Moves between the students of the assignment from the top bar, as
 * Classroom's grading tool does: back, a searchable list grouped by what
 * each student's work needs, and next. A class of any size stays one search
 * away, with what is left to grade at the top.
 */
function StudentSwitcher({ data, onGo }: StudentSwitcherProps) {
  const index = data.queue.findIndex(
    (row) => row.studentId === data.student.studentId,
  );
  const previous = data.queue[index - 1];
  const next = data.queue[index + 1];
  const names = new Map(
    data.queue.map((row) => [row.studentId, displayName(row)]),
  );
  const groups = STANDINGS.map((standing) => ({
    value: standing,
    items: data.queue
      .filter((row) => standingOf(row) === standing)
      .map((row) => row.studentId),
  })).filter((group) => group.items.length);
  // Layout containment holds the combobox's fixed, visually hidden input
  // inside the row; at the page edge its -1px margin widened right-to-left
  // pages by a pixel and drew a sideways scrollbar.
  return (
    <div className="flex min-w-0 items-center gap-1 contain-layout">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={m.courseworkPreviousStudent()}
        disabled={!previous}
        onClick={() => previous && onGo(previous.studentId)}
      >
        <ChevronLeft className="rtl:-scale-x-100" aria-hidden />
      </Button>
      <Combobox
        items={groups}
        value={data.student.studentId}
        itemToStringLabel={(item: string) => names.get(item) ?? ""}
        onValueChange={(value) => {
          if (typeof value === "string") onGo(value);
        }}
      >
        <ComboboxTrigger
          aria-label={m.courseworkChooseStudent()}
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-48 min-w-0 justify-between border-input bg-transparent px-2.5 font-normal max-sm:w-32 dark:bg-input/30"
            />
          }
        >
          <bdi className="min-w-0 flex-1 truncate text-start">
            {displayName(data.student)}
          </bdi>
        </ComboboxTrigger>
        <ComboboxContent align="end" className="w-72">
          <ComboboxInput
            showTrigger={false}
            aria-label={m.courseworkSearchStudents()}
            placeholder={m.courseworkSearchStudents()}
          />
          <ComboboxEmpty>{m.managementNoMatches()}</ComboboxEmpty>
          <ComboboxList>
            {(group: { value: Standing; items: string[] }) => (
              <ComboboxGroup key={group.value} items={group.items}>
                <ComboboxLabel>
                  {STANDING_LABEL[group.value]({
                    count: formatNumber(group.items.length),
                  })}
                </ComboboxLabel>
                <ComboboxCollection>
                  {(item: string) => (
                    <ComboboxItem
                      key={item}
                      value={item}
                      className="max-md:min-h-10"
                    >
                      <bdi className="truncate">{names.get(item)}</bdi>
                    </ComboboxItem>
                  )}
                </ComboboxCollection>
              </ComboboxGroup>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={m.courseworkNextStudent()}
        disabled={!next}
        onClick={() => next && onGo(next.studentId)}
      >
        <ChevronRight className="rtl:-scale-x-100" aria-hidden />
      </Button>
    </div>
  );
}

interface GradeSheetProps {
  data: Data;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  comments: {
    passages: Record<string, string>;
    active: string | null;
    onShow: (id: string) => void;
    onCommentOn: (block: string) => void;
  };
}

/**
 * The grade for the attempt on screen, in a sheet from the end side: for
 * assessed coursework the declaration and the teacher's word first, then the
 * rubric, score and feedback, which stay drafts until the work is returned.
 */
function GradeSheet({
  data,
  open,
  onOpenChange,
  onDone,
  comments,
}: GradeSheetProps) {
  const attempt = data.attempts.at(-1);
  const rubric = data.assignment.rubric;
  const saved = attempt?.assessment ?? null;
  const [score, setScore] = useState(
    saved?.score === null || saved?.score === undefined
      ? ""
      : String(saved.score),
  );
  const [levels, setLevels] = useState<Record<string, string>>(
    saved?.rubricScores ?? {},
  );
  const [rubricNotes, setRubricNotes] = useState<Record<string, string>>(
    saved?.rubricComments ?? {},
  );
  const [noting, setNoting] = useState(
    () => new Set(Object.keys(saved?.rubricComments ?? {})),
  );
  const [feedback, setFeedback] = useState(saved?.feedback ?? "");
  const [feedbackBank, setFeedbackBank] = useState(false);
  const [note, setNote] = useState(saved?.privateNote ?? "");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const standing = useQuery({
    ...workStandingQuery(data.assignment.id),
    enabled: !data.quiz,
  }).data;
  // Confirmed coursework is final, so it is never sent back to revise.
  const final =
    standing?.students.find((row) => row.studentId === data.student.studentId)
      ?.authentication?.outcome === "confirmed";
  const assess = useMutation({
    mutationFn: () =>
      assessAttempt({
        data: {
          attemptId: attempt?.id ?? "",
          score: score === "" ? null : Number(score),
          rubricScores: rubric ? levels : null,
          rubricComments: rubric ? rubricNotes : null,
          feedback,
          privateNote: note,
        },
      }),
  });
  const act = useMutation({
    mutationFn: (action: "return" | "revise") =>
      actOnWork({
        data: {
          assignmentId: data.assignment.id,
          action,
          studentIds: [data.student.studentId],
        },
      }),
  });
  const show = useMutation({
    mutationFn: () => showHeldGrade({ data: { attemptId: attempt?.id ?? "" } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["coursework"] }),
    onError: (failure) => toast.error(getMessageFromError(failure)),
  });
  const held = Boolean(saved?.commentsReleasedAt && !saved.releasedAt);
  const points = data.assignment.points;
  const pending = assess.isPending || act.isPending;
  const check = () => {
    const value = score === "" ? null : Number(score);
    if (
      value !== null &&
      (Number.isNaN(value) || value < 0 || (points !== null && value > points))
    ) {
      setError(m.courseworkScoreRange({ points: formatNumber(points ?? 0) }));
      return false;
    }
    setError(null);
    return true;
  };
  const run = async (then?: "return" | "revise") => {
    if (!check()) return;
    try {
      await assess.mutateAsync();
      const acted = then ? await act.mutateAsync(then) : null;
      await queryClient.invalidateQueries({ queryKey: ["coursework"] });
      if (acted && "held" in acted) {
        toast.warning(
          then === "return"
            ? m.authenticationNeededToReturn()
            : m.authenticationFinalNoRevision(),
        );
        return;
      }
      toast.success(
        then === "return"
          ? m.courseworkReturnedDone()
          : then === "revise"
            ? m.courseworkRevisionDone()
            : m.courseworkGradeSaved(),
      );
      if (then) onDone();
      else onOpenChange(false);
    } catch (failure) {
      toast.error(getMessageFromError(failure));
    }
  };
  // The work's blocks by their opening words, to comment on one without
  // selecting it, from a keyboard or a phone.
  const paragraphs = (attempt?.content?.root.children ?? []).flatMap((node) => {
    const words = contentPlainText({
      root: { type: "root", version: 1, children: [node] },
    }).trim();
    const block = node.$?.id;
    return block && words
      ? [
          {
            value: block,
            label: words.length > 60 ? `${words.slice(0, 60)}…` : words,
          },
        ]
      : [];
  });
  // Comments on earlier attempts, with the words they marked there, so a
  // grader checks what a revision fixed.
  const earlier = data.attempts.slice(0, -1).flatMap((previous) =>
    previous.comments.map((comment) => ({
      ...comment,
      on: previous.content,
    })),
  );
  const earlierWords = Object.fromEntries(
    earlier.flatMap((comment) =>
      comment.on ? [[comment.id, wordsAt(comment.on, comment.anchor)]] : [],
    ),
  );
  const side = getTextDirection(getLocale()) === "rtl" ? "left" : "right";
  // Beside the work on a wide screen, so the teacher reads while grading;
  // over it on a narrower one.
  const beside = useMedia("(min-width: 64rem)");
  useEffect(() => {
    if (!open || !comments.active) return;
    document
      .getElementById(`comment-${comments.active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [open, comments.active]);
  return (
    <Sheet
      modal={!beside}
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
      <SheetContent
        side={side}
        showCloseButton={false}
        backdrop={!beside}
        className={cn(
          // Below the top bar, which keeps moving between students.
          beside &&
            "data-[side=left]:top-12 data-[side=left]:h-auto data-[side=right]:top-12 data-[side=right]:h-auto",
          "gap-0 p-0 data-[side=left]:w-full data-[side=right]:w-full data-[side=left]:sm:max-w-[480px] data-[side=right]:sm:max-w-[480px]",
        )}
      >
        <SheetHeader className="border-b px-6 py-4 pe-14 max-md:pe-16">
          <SheetTitle className="text-base leading-6 font-semibold">
            {m.courseworkGradeStudent({ name: displayName(data.student) })}
          </SheetTitle>
        </SheetHeader>
        <SheetClose
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={m.commonClose()}
              className="absolute end-4 top-3 max-md:top-2 max-md:size-10"
            />
          }
        >
          <X aria-hidden />
        </SheetClose>
        <div className="grid min-h-0 flex-1 content-start gap-6 overflow-y-auto px-6 py-6">
          {data.quiz ? null : (
            <CourseworkStanding
              assignmentId={data.assignment.id}
              studentId={data.student.studentId}
            />
          )}
          {held ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
              <p className="text-sm leading-5">{m.courseworkGradeHeld()}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={show.isPending}
                onClick={() => show.mutate()}
              >
                {m.courseworkShowGradeNow()}
              </Button>
            </div>
          ) : null}
          {attempt && !data.quiz && !data.discussion ? (
            <section aria-labelledby="grade-comments" className="grid gap-3">
              <div className="grid gap-0.5">
                <h3
                  id="grade-comments"
                  className="text-sm leading-5 font-semibold"
                >
                  {m.courseworkComments()}
                </h3>
                <p className="text-[13px] leading-[18px] text-muted-foreground">
                  {m.courseworkCommentsHint()}
                </p>
              </div>
              {paragraphs.length ? (
                <SelectField
                  id="comment-paragraph"
                  label={m.courseworkCommentParagraph()}
                  hint={m.courseworkCommentParagraphHint()}
                  value=""
                  options={[
                    { value: "", label: m.courseworkChooseParagraph() },
                    ...paragraphs,
                  ]}
                  onChange={(block) => {
                    if (!block) return;
                    comments.onCommentOn(block);
                    if (!beside) onOpenChange(false);
                  }}
                />
              ) : null}
              {attempt.comments.length ? (
                <CommentList
                  comments={attempt.comments}
                  criteria={data.assignment.rubric?.criteria}
                  passages={comments.passages}
                  active={comments.active}
                  onShow={(id) => {
                    comments.onShow(id);
                    if (!beside) onOpenChange(false);
                  }}
                />
              ) : null}
              {earlier.length ? (
                <details className="group grid gap-3">
                  <summary className="cursor-pointer text-sm leading-5 font-medium text-muted-foreground hover:text-foreground">
                    {m.courseworkEarlierComments({ count: earlier.length })}
                  </summary>
                  <div className="mt-3 grid gap-3">
                    <CommentList
                      comments={earlier}
                      criteria={data.assignment.rubric?.criteria}
                      passages={earlierWords}
                      active={null}
                    />
                  </div>
                </details>
              ) : null}
            </section>
          ) : null}
          {rubric
            ? rubric.criteria.map((criterion) => (
                <div key={criterion.id} className="grid gap-2">
                  <SelectField
                    id={`level-${criterion.id}`}
                    label={criterion.title}
                    hint={
                      criterion.levels.find(
                        (level) => level.id === levels[criterion.id],
                      )?.description || undefined
                    }
                    value={levels[criterion.id] ?? "none"}
                    options={[
                      { value: "none", label: m.commonNotRecorded() },
                      ...criterion.levels.map((level) => ({
                        value: level.id,
                        label: m.courseworkRubricLevel({
                          level: level.title,
                          points: formatNumber(level.points),
                        }),
                      })),
                    ]}
                    onChange={(value) => {
                      const nextLevels = { ...levels };
                      if (value === "none") delete nextLevels[criterion.id];
                      else nextLevels[criterion.id] = value;
                      setLevels(nextLevels);
                      setScore(String(levelTotal(rubric, nextLevels)));
                    }}
                  />
                  {noting.has(criterion.id) ? (
                    <FormField
                      id={`level-note-${criterion.id}`}
                      label={m.courseworkRubricComment({
                        criterion: criterion.title,
                      })}
                      optional
                    >
                      {(control) => (
                        <Textarea
                          {...control}
                          dir="auto"
                          rows={2}
                          maxLength={1000}
                          value={rubricNotes[criterion.id] ?? ""}
                          onChange={(event) =>
                            setRubricNotes({
                              ...rubricNotes,
                              [criterion.id]: event.target.value,
                            })
                          }
                        />
                      )}
                    </FormField>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="-ms-2 justify-self-start max-md:h-10"
                      aria-label={m.courseworkRubricComment({
                        criterion: criterion.title,
                      })}
                      onClick={() => {
                        setNoting(new Set([...noting, criterion.id]));
                        requestAnimationFrame(() =>
                          document
                            .getElementById(`level-note-${criterion.id}`)
                            ?.focus(),
                        );
                      }}
                    >
                      <Plus aria-hidden />
                      {m.courseworkRubricAddComment()}
                    </Button>
                  )}
                </div>
              ))
            : null}
          {data.toolScores.length > 0 ? (
            <section aria-labelledby="grade-tools" className="grid gap-2">
              <div className="grid gap-0.5">
                <h3
                  id="grade-tools"
                  className="text-sm leading-5 font-semibold"
                >
                  {m.ltiToolScores()}
                </h3>
                <p className="text-[13px] leading-[18px] text-muted-foreground">
                  {m.ltiToolScoresHint()}
                </p>
              </div>
              <ul className="grid gap-2">
                {data.toolScores.map((row) => {
                  // A tool counts out of its own column; the mark counts out
                  // of the assignment's points.
                  const mark =
                    row.result === null
                      ? null
                      : Math.round(
                          (points === null
                            ? row.result
                            : (row.result / row.maximum) * points) * 100,
                        ) / 100;
                  return (
                    <li
                      key={row.lineItemId}
                      className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg bg-muted/50 px-3 py-2"
                    >
                      <div className="grid min-w-0 gap-0.5">
                        <span className="text-sm leading-5 font-medium">
                          <bdi>{row.label}</bdi> ·{" "}
                          <bdi className="font-normal text-muted-foreground">
                            {row.toolName}
                          </bdi>
                        </span>
                        <span className="text-[13px] leading-[18px] text-muted-foreground">
                          {row.result === null
                            ? toolGrading(row.gradingProgress)
                            : `${m.ltiScoreOf({
                                score: formatNumber(
                                  Math.round(row.result * 100) / 100,
                                ),
                                maximum: formatNumber(row.maximum),
                              })} · ${toolGrading(row.gradingProgress)}`}
                        </span>
                        {row.comment ? (
                          <p
                            dir="auto"
                            className="text-[13px] leading-[18px] whitespace-pre-line"
                          >
                            {row.comment}
                          </p>
                        ) : null}
                      </div>
                      {mark !== null && attempt ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="max-md:h-10"
                          aria-label={m.ltiUseScoreFor({ label: row.label })}
                          onClick={() => setScore(String(mark))}
                        >
                          {m.ltiUseScore()}
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          <TextField
            id="grade-score"
            label={
              points === null
                ? m.courseworkScore()
                : m.courseworkScoreOutOf({ points: formatNumber(points) })
            }
            hint={rubric ? m.courseworkScoreFromRubric() : undefined}
            type="number"
            inputMode="decimal"
            min={0}
            step={0.5}
            width="score"
            value={score}
            onChange={(event) => setScore(event.target.value)}
            errors={error ? [error] : undefined}
          />
          <FormField
            id="grade-feedback"
            label={m.courseworkFeedback()}
            hint={m.courseworkFeedbackHint()}
          >
            {(control) => (
              <div className="grid justify-items-start gap-1">
                <Textarea
                  {...control}
                  dir="auto"
                  rows={6}
                  maxLength={10000}
                  value={feedback}
                  onChange={(event) => setFeedback(event.target.value)}
                />
                <CommentBankPicker
                  open={feedbackBank}
                  onOpenChange={setFeedbackBank}
                  onPick={({ body }) =>
                    setFeedback((current) =>
                      current.trim() ? `${current.trimEnd()}\n${body}` : body,
                    )
                  }
                />
              </div>
            )}
          </FormField>
          {attempt && !data.quiz ? (
            <VoiceFeedback
              attemptId={attempt.id}
              recordings={attempt.recordings}
            />
          ) : null}
          <FormField
            id="grade-note"
            label={m.courseworkPrivateNote()}
            hint={m.courseworkPrivateNoteHint()}
            optional
          >
            {(control) => (
              <Textarea
                {...control}
                dir="auto"
                rows={3}
                maxLength={2000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
            )}
          </FormField>
        </div>
        <SheetFooter className="flex-row flex-wrap justify-start gap-2 border-t px-6 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button
            type="button"
            className="max-md:h-10"
            disabled={pending}
            onClick={() => void run("return")}
          >
            {pending ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <Send aria-hidden />
            )}
            {m.courseworkReturnNext()}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            disabled={pending}
            onClick={() => void run()}
          >
            {m.courseworkSaveDraftGrade()}
          </Button>
          {final ? null : (
            <Button
              type="button"
              variant="ghost"
              className="max-md:h-10"
              disabled={pending}
              onClick={() => void run("revise")}
            >
              {m.courseworkReturnRevise()}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export interface GradingProps {
  assignmentId: string;
  studentId: string;
}

/**
 * One student's work, read in the document column with the class moved
 * through from the top bar; the grade opens in a sheet. J and K move to the
 * next and previous student.
 */
export function Grading({ assignmentId, studentId }: GradingProps) {
  const data = useSuspenseQuery(gradingQuery(assignmentId, studentId)).data;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [grading, setGrading] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [reveal, setReveal] = useState(0);
  const [passages, setPassages] = useState<Record<string, string>>({});
  const [commentOn, setCommentOn] = useState<{ block: string; at: number }>();
  // The grade sheet stays open from one student to the next; a comment
  // being written or shown belongs to the student it was on.
  const [commentsOf, setCommentsOf] = useState(studentId);
  if (commentsOf !== studentId) {
    setCommentsOf(studentId);
    setActive(null);
    setPassages({});
    setCommentOn(undefined);
  }
  const index = data.queue.findIndex((row) => row.studentId === studentId);
  const goTo = (target: string) =>
    void navigate({
      to: "/teach/grading",
      search: { assignmentId, studentId: target },
    });
  const go = (offset: number) => {
    const next = data.queue[index + offset];
    if (next) goTo(next.studentId);
  };
  const backToWork = () =>
    void navigate({
      to: "/assignments/$assignmentId",
      params: { assignmentId },
      search: { tab: "work" },
    });
  const nextToGrade = () => {
    const later = data.queue.slice(index + 1).find((row) => row.needsGrading);
    const target =
      later ??
      data.queue.find((row) => row.needsGrading && row.studentId !== studentId);
    if (target) goTo(target.studentId);
    else backToWork();
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        grading ||
        target?.closest(
          "input, textarea, select, [contenteditable=true], [role=combobox]",
        )
      )
        return;
      if (event.key === "j") go(1);
      if (event.key === "k") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const attempt = data.attempts.at(-1);
  const assessed = attempt?.assessment ?? null;
  const facts = attempt
    ? [
        m.courseworkAttemptNumber({ number: attempt.number }),
        formatInstant(attempt.submittedAt),
        attempt.isLate ? m.courseworkLate() : null,
      ].filter(Boolean)
    : [];
  return (
    <>
      <PageActions
        leading={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={m.docBack()}
            onClick={backToWork}
          >
            <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
          </Button>
        }
      >
        <StudentSwitcher data={data} onGo={goTo} />
        {attempt ? (
          <Button
            type="button"
            size="sm"
            aria-label={
              assessed ? m.courseworkEditGrade() : m.courseworkGradeAction()
            }
            className="max-sm:size-8 max-sm:px-0"
            onClick={() => setGrading(true)}
          >
            <PenLine aria-hidden />
            <span className="max-sm:sr-only">
              {assessed ? m.courseworkEditGrade() : m.courseworkGradeAction()}
            </span>
          </Button>
        ) : null}
      </PageActions>
      <div className={cn(grading && "lg:pe-[480px]")}>
        <article className="mx-auto grid w-full max-w-[720px] gap-6 pb-24">
          <header className="grid gap-1">
            <Link
              to="/assignments/$assignmentId"
              params={{ assignmentId }}
              search={{ tab: "work" }}
              className="text-[13px] leading-[18px] text-muted-foreground hover:underline"
            >
              {data.assignment.title}
            </Link>
            <h1 className="text-[30px] leading-[38px] font-semibold tracking-tight">
              <bdi>{displayName(data.student)}</bdi>
            </h1>
            {facts.length ? (
              <p className="text-sm leading-5 text-muted-foreground">
                {facts.join(" · ")}
              </p>
            ) : null}
            {assessed ? (
              <p className="text-sm leading-5">
                {[
                  assessed.score === null
                    ? null
                    : resultText(
                        assessed.grade,
                        assessed.effectiveScore ?? assessed.score,
                        data.assignment.points,
                        "teacher",
                      ),
                  assessed.releasedAt
                    ? m.courseworkStateReturned()
                    : assessed.commentsReleasedAt
                      ? m.courseworkGradeHeld()
                      : m.courseworkDraftGrade(),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : null}
          </header>
          {data.quiz ? (
            <QuizAttempts
              quiz={data.quiz}
              onMarked={() =>
                queryClient.invalidateQueries({ queryKey: ["coursework"] })
              }
            />
          ) : data.discussion ? (
            <DiscussionPosts
              standing={data.discussion}
              posts={data.discussion.posts}
            />
          ) : attempt ? (
            <div className="grid gap-4">
              {attempt.content ? (
                <CommentedWork
                  document={attempt.content}
                  comments={attempt.comments}
                  active={active}
                  reveal={reveal}
                  attemptId={attempt.id}
                  criteria={data.assignment.rubric?.criteria}
                  commentOn={commentOn}
                  onPassages={setPassages}
                  onOpen={setActive}
                />
              ) : null}
              <FileList files={attempt.files} />
            </div>
          ) : (
            <RecordEmpty>{m.courseworkNothingHandedIn()}</RecordEmpty>
          )}
          {data.assignment.peer ? (
            <StudentPeerReviews
              assignmentId={data.assignment.id}
              studentId={studentId}
            />
          ) : null}
        </article>
      </div>
      {attempt ? (
        <GradeSheet
          // A marked quiz answer or another attempt starts the form again.
          key={`${studentId}-${attempt.id}-${assessed?.score ?? ""}`}
          data={data}
          open={grading}
          onOpenChange={setGrading}
          onDone={() => {
            setGrading(false);
            nextToGrade();
          }}
          comments={{
            passages,
            active,
            onShow: (id) => {
              setActive(id);
              setReveal((count) => count + 1);
            },
            onCommentOn: (block) => setCommentOn({ block, at: Date.now() }),
          }}
        />
      ) : null}
    </>
  );
}
