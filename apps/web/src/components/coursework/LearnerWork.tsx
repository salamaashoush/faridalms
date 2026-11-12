import type { ContentDocument } from "@faridalms/domain/content";
import type { HeaderFact } from "@faridalms/ui/system/record-page";

import { contentPlainText } from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import { documentWritten } from "@faridalms/domain/translations";
import { Button } from "@faridalms/ui/button";
import { FormField } from "@faridalms/ui/system/form-field";
import { Page } from "@faridalms/ui/system/page";
import {
  RecordEmpty,
  RecordHeader,
  RecordList,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { RubricMatrix } from "@faridalms/ui/system/rubric";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { UnsavedChangesGuard } from "@faridalms/ui/system/unsaved-changes-guard";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { CheckCircle2, Undo2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import type { Locale } from "~/i18n/runtime";

import { ContentEditor } from "~/components/content/ContentEditor";
import { ContentView } from "~/components/content/ContentView";
import { usePrint } from "~/components/print/usePrint";
import { SaveIndicator } from "~/components/system/DocumentPage";
import { FileList } from "~/components/system/FileList";
import {
  ReaderWidthToggle,
  useReaderWidth,
} from "~/components/system/ReaderWidth";
import { useAutosave } from "~/hooks/useAutosave";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { myWorkQuery } from "~/queries/coursework";
import { handInWork, saveMyDraft, undoHandIn } from "~/server/coursework";
import { formatInstant } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { classTitle } from "../classes/format";
import { resultText } from "../grading/format";
import { useBriefLanguage } from "./BriefLanguage";
import { Discussion } from "./Discussion";
import { STATE_LABEL, STATE_TONE } from "./format";
import { QuizWork } from "./QuizWork";
import { workParts } from "./slots";
import { Recordings } from "./VoiceFeedback";
import { CommentedWork, CommentList } from "./WorkComments";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof myWorkQuery>["queryFn"]>>
>;
type Attempt = Data["attempts"][number];

interface RubricResultProps {
  data: Data;
  scores: Record<string, string> | null;
  comments: Record<string, string> | null;
  /** The comments on passages linked to each criterion. */
  remarks: { criterionId: string | null }[];
}

function RubricResult({ data, scores, comments, remarks }: RubricResultProps) {
  const rubric = data.assignment.rubric;
  if (!rubric || !scores) return null;
  const linked = (id: string) =>
    remarks.filter((remark) => remark.criterionId === id).length;
  return (
    <RubricMatrix
      label={m.courseworkRubric()}
      criteria={rubric.criteria}
      awarded={scores}
      renderCriterionMeta={(criterion) =>
        linked(criterion.id)
          ? m.courseworkCommentCount({ count: linked(criterion.id) })
          : null
      }
      renderCriterionNote={(criterion) =>
        comments?.[criterion.id] ? (
          <p dir="auto" className="text-sm leading-5 whitespace-pre-wrap">
            {comments[criterion.id]}
          </p>
        ) : null
      }
    />
  );
}

interface AttemptItemProps {
  data: Data;
  attempt: Attempt;
}

function AttemptItem({ data, attempt }: AttemptItemProps) {
  const assessment = attempt.assessment;
  const [active, setActive] = useState<string | null>(null);
  const [reveal, setReveal] = useState(0);
  const [passages, setPassages] = useState<Record<string, string>>({});
  return (
    <li className="grid gap-3 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm leading-5 font-medium">
          {m.courseworkAttemptNumber({ number: attempt.number })}
        </span>
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {[
            formatInstant(attempt.submittedAt),
            attempt.isLate ? m.courseworkLate() : null,
            attempt.byTeacher ? m.courseworkByTeacher() : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      {attempt.content && contentPlainText(attempt.content).trim() ? (
        attempt.comments.length ? (
          <CommentedWork
            document={attempt.content}
            comments={attempt.comments}
            answering
            criteria={data.assignment.rubric?.criteria}
            active={active}
            reveal={reveal}
            onPassages={setPassages}
            onOpen={setActive}
          />
        ) : (
          <ContentView
            document={attempt.content}
            fileUrl={(id) => `/files/${id}`}
          />
        )
      ) : null}
      <FileList files={attempt.files} />
      {attempt.comments.length ? (
        <section
          aria-labelledby={`comments-${attempt.id}`}
          className="grid gap-3"
        >
          <h4
            id={`comments-${attempt.id}`}
            className="text-sm leading-5 font-semibold"
          >
            {m.courseworkTeacherComments()}
          </h4>
          <CommentList
            mine
            comments={attempt.comments}
            criteria={data.assignment.rubric?.criteria}
            passages={passages}
            active={active}
            onShow={(id) => {
              setActive(id);
              setReveal((count) => count + 1);
            }}
          />
        </section>
      ) : null}
      {assessment ? (
        <div className="grid gap-2 rounded-lg bg-muted/50 p-3">
          {assessment.gradeHeld ? (
            <p className="text-sm leading-5 font-medium">
              {m.courseworkGradeHeldStudent()}
            </p>
          ) : null}
          {assessment.effectiveScore !== null || assessment.score !== null ? (
            <p className="text-sm leading-5 font-medium tabular-nums">
              {resultText(
                assessment.grade,
                assessment.effectiveScore ?? assessment.score,
                data.assignment.points,
                "learner",
              )}
            </p>
          ) : null}
          <RubricResult
            data={data}
            scores={assessment.rubricScores}
            comments={assessment.rubricComments}
            remarks={attempt.comments}
          />
          {assessment.feedback ? (
            <p dir="auto" className="text-sm leading-5 whitespace-pre-wrap">
              {assessment.feedback}
            </p>
          ) : null}
          {attempt.recordings.length ? (
            <Recordings recordings={attempt.recordings} />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

interface YourWorkProps {
  data: Data;
}

function YourWork({ data }: YourWorkProps) {
  const queryClient = useQueryClient();
  const media = useDocumentMedia({ type: "work", id: data.assignment.id });
  const format = data.assignment.submissionFormat;
  const editable = data.canHandIn;
  const writes = editable && format !== "none";
  const [content, setContent] = useState<ContentDocument>(
    data.submission.content ?? emptyContent(),
  );
  // Hand-in waits for files still uploading into the answer.
  const [uploading, setUploading] = useState(false);
  const version = useRef(data.submission.version);
  const [confirming, setConfirming] = useState(false);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["coursework"] });
  const persist = useCallback(
    async (value: ContentDocument) => {
      const saved = await saveMyDraft({
        data: {
          assignmentId: data.assignment.id,
          expectedVersion: version.current,
          content: value,
        },
      });
      version.current = saved.version;
    },
    [data.assignment.id],
  );
  const autosave = useAutosave({
    value: content,
    save: persist,
    enabled: writes,
  });
  const handIn = useMutation({
    mutationFn: async () => {
      if (writes && !(await autosave.flush()))
        throw new Error(m.courseworkDraftNotSaved());
      return handInWork({
        data: {
          assignmentId: data.assignment.id,
          expectedVersion: version.current,
        },
      });
    },
    meta: { inlineError: true },
  });
  const undo = useMutation({
    mutationFn: () =>
      undoHandIn({ data: { assignmentId: data.assignment.id } }),
  });
  return (
    <RecordSection
      variant="page"
      title={m.courseworkYourWork()}
      description={
        data.canHandIn
          ? m.courseworkYourWorkHint()
          : data.state === "returned"
            ? m.courseworkReturnedHint()
            : data.state === "excused"
              ? m.courseworkExcusedHint()
              : m.courseworkHandedInHint()
      }
    >
      <div className="grid gap-4">
        {writes ? (
          <FormField
            id="your-work"
            label={
              format === "files"
                ? m.courseworkYourFiles()
                : m.courseworkWriteHere()
            }
            hint={
              format === "online"
                ? undefined
                : format === "online_and_files"
                  ? m.courseworkWrittenAndFilesHint()
                  : m.courseworkFilesInAnswerHint()
            }
          >
            {(control) => (
              <div className="min-w-0">
                <ContentEditor
                  id={control.id}
                  label={
                    format === "files"
                      ? m.courseworkYourFiles()
                      : m.courseworkWriteHere()
                  }
                  value={content}
                  onChange={setContent}
                  onUploadingChange={setUploading}
                  media={media}
                  aiUse
                />
              </div>
            )}
          </FormField>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          {data.canHandIn ? (
            <Button
              type="button"
              className="max-md:h-10"
              disabled={uploading}
              onClick={() => setConfirming(true)}
            >
              <CheckCircle2 aria-hidden />
              {format === "none"
                ? m.courseworkMarkDone()
                : m.courseworkHandIn()}
            </Button>
          ) : null}
          {data.canUndo ? (
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              disabled={undo.isPending}
              onClick={async () => {
                try {
                  await undo.mutateAsync();
                  await refresh();
                  toast.success(m.courseworkUndone());
                } catch (error) {
                  toast.error(getMessageFromError(error));
                }
              }}
            >
              <Undo2 aria-hidden />
              {m.courseworkUndoHandIn()}
            </Button>
          ) : null}
          {writes ? (
            <SaveIndicator
              state={autosave.state}
              onRetry={() => void autosave.retry()}
            />
          ) : null}
        </div>
      </div>
      <UnsavedChangesGuard
        isDirty={() => writes && autosave.dirty}
        pending={autosave.busy()}
      />
      <SheetForm
        open={confirming}
        onOpenChange={setConfirming}
        title={m.courseworkHandInTitle({ title: data.assignment.title })}
        submitLabel={
          format === "none" ? m.courseworkMarkDone() : m.courseworkHandIn()
        }
        pending={handIn.isPending}
        error={handIn.error ? getMessageFromError(handIn.error) : null}
        onSubmit={async () => {
          await handIn.mutateAsync().then(
            async () => {
              await refresh();
              setConfirming(false);
              toast.success(m.courseworkHandedInDone());
            },
            () => undefined,
          );
        }}
      >
        <p className="text-sm leading-5 text-muted-foreground">
          {data.assignment.resubmission
            ? m.courseworkHandInBodyAgain()
            : m.courseworkHandInBody()}
        </p>
      </SheetForm>
    </RecordSection>
  );
}

export interface LearnerWorkProps {
  assignmentId: string;
}

export function LearnerWork({ assignmentId }: LearnerWorkProps) {
  const data = useSuspenseQuery(myWorkQuery(assignmentId)).data;
  const me = useCurrentUser().id;
  const learnerParts = useSlot(workParts).filter(
    (part) => part.where === "learner",
  );
  const width = useReaderWidth();
  const facts: HeaderFact[] = [];
  if (data.assignment.class)
    facts.push({
      label: m.studentClass(),
      value: classTitle(data.assignment.class),
    });
  if (data.assignment.dueAt)
    facts.push({
      label: m.courseworkDue(),
      value: m.courseworkDueOn({
        date: formatInstant(data.assignment.dueAt),
      }),
    });
  if (data.assignment.points !== null)
    facts.push({
      label: m.courseworkPoints(),
      value: m.courseworkPointsCount({ count: data.assignment.points }),
    });
  // A discussion's posts are its work, shown above; its attempt carries only the grade.
  const attempts =
    data.assignment.submissionFormat === "discussion"
      ? data.attempts.filter((attempt) => attempt.assessment)
      : data.attempts;
  const dueAt = data.assignment.dueAt;
  const due = (locale: Locale) =>
    dueAt
      ? [
          m.courseworkDueOn(
            { date: formatInstant(dueAt, "full", locale) },
            { locale },
          ),
        ]
      : [];
  const reading = useBriefLanguage({
    title: data.assignment.title,
    brief: data.brief,
    language: data.assignment.language,
    translation: data.translation,
  });
  const briefPrint = usePrint(
    reading.brief
      ? {
          title: reading.title,
          facts: due,
          content: reading.brief,
          link: `/assignments/${data.assignment.id}`,
        }
      : null,
  );
  const workPrint = usePrint(
    data.submission.content && documentWritten(data.submission.content)
      ? {
          label: m.printMyWork(),
          title: data.assignment.title,
          facts: due,
          content: data.submission.content,
        }
      : null,
  );
  return (
    <Page width={width.wide ? "list" : "form"}>
      <div className="grid gap-6">
        <RecordHeader
          variant="document"
          title={reading.title}
          facts={facts}
          tools={
            <ReaderWidthToggle wide={width.wide} onToggle={width.toggle} />
          }
          status={{
            label: STATE_LABEL[data.state](),
            tone: STATE_TONE[data.state],
          }}
          menu={[briefPrint.action, workPrint.action].filter(
            (action) => action !== null,
          )}
        />
        {reading.switcher}
        {reading.brief ? (
          <div lang={reading.lang} dir={reading.dir}>
            <ContentView
              document={reading.brief}
              fileUrl={(id) => `/files/${id}`}
            />
          </div>
        ) : (
          <RecordEmpty>{m.courseworkNoBrief()}</RecordEmpty>
        )}
        {data.quiz ? (
          <QuizWork
            key={data.attempts.length}
            data={data}
            reading={reading.lang}
          />
        ) : data.assignment.submissionFormat === "discussion" ? (
          <Discussion assignmentId={data.assignment.id} />
        ) : (
          <YourWork
            key={`${data.submission.version}-${data.attempts.length}`}
            data={data}
          />
        )}
        {learnerParts.map(({ key, Part }) => (
          <Part key={key} assignmentId={data.assignment.id} studentId={me} />
        ))}
        {attempts.length > 0 ? (
          <RecordSection variant="page" title={m.courseworkAttempts()}>
            <RecordList>
              {attempts.toReversed().map((attempt) => (
                <AttemptItem key={attempt.id} data={data} attempt={attempt} />
              ))}
            </RecordList>
          </RecordSection>
        ) : null}
        {briefPrint.sheet}
        {workPrint.sheet}
      </div>
    </Page>
  );
}
