import type { ContentDocument } from "@faridalms/domain/content";

import { contentPlainText } from "@faridalms/domain/content";
import { emptyContent } from "@faridalms/domain/content-conversion";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { CheckCircle2, Save, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { HeaderFact } from "~/components/system/RecordPage";

import { ContentEditor } from "~/components/content/ContentEditor";
import { ContentView } from "~/components/content/ContentView";
import {
  DeclarationFields,
  declarationReady,
  DeclareSheet,
  NO_DECLARATION,
} from "~/components/exams/Declaration";
import { isolatedLine, sessionName } from "~/components/exams/names";
import { FormField } from "~/components/system/field";
import { FileList } from "~/components/system/FileList";
import {
  ReaderWidthToggle,
  useReaderWidth,
} from "~/components/system/ReaderWidth";
import {
  RecordEmpty,
  RecordHeader,
  RecordList,
  RecordSection,
} from "~/components/system/RecordPage";
import { SheetForm } from "~/components/system/SheetForm";
import { useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { myWorkQuery } from "~/queries/coursework";
import { myStandingQuery } from "~/queries/exams";
import { handInWork, saveMyDraft, undoHandIn } from "~/server/coursework";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { classTitle } from "../classes/format";
import { formatInstant, formatScore, STATE_LABEL, STATE_TONE } from "./format";
import { QuizWork } from "./QuizWork";
import { useDocumentMedia } from "./useDocumentMedia";

type Data = Awaited<
  ReturnType<NonNullable<ReturnType<typeof myWorkQuery>["queryFn"]>>
>;
type Attempt = Data["attempts"][number];

function RubricResult({
  data,
  scores,
}: {
  data: Data;
  scores: Record<string, string> | null;
}) {
  const rubric = data.assignment.rubric;
  if (!rubric || !scores) return null;
  return (
    <ul className="grid gap-1 text-sm leading-5">
      {rubric.criteria.map((criterion) => {
        const level = criterion.levels.find(
          (row) => row.id === scores[criterion.id],
        );
        return (
          <li
            key={criterion.id}
            className="flex flex-wrap justify-between gap-x-4"
          >
            <span dir="auto">{criterion.title}</span>
            <span className="text-muted-foreground" dir="auto">
              {level
                ? m.courseworkRubricLevel({
                    level: level.title,
                    points: formatNumber(level.points),
                  })
                : m.commonNotRecorded()}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function AttemptItem({ data, attempt }: { data: Data; attempt: Attempt }) {
  const user = useCurrentUser();
  const assessment = attempt.assessment;
  return (
    <li className="grid gap-3 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm leading-5 font-medium">
          {m.courseworkAttemptNumber({ number: attempt.number })}
        </span>
        <span className="text-[13px] leading-[18px] text-muted-foreground">
          {[
            formatInstant(attempt.submittedAt, user.school.timeZone),
            attempt.isLate ? m.courseworkLate() : null,
            attempt.byTeacher ? m.courseworkByTeacher() : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      {attempt.content && contentPlainText(attempt.content).trim() ? (
        <ContentView
          document={attempt.content}
          fileUrl={(id) => `/files/${id}`}
        />
      ) : null}
      <FileList files={attempt.files} />
      {assessment ? (
        <div className="grid gap-2 rounded-lg bg-muted/50 p-3">
          {assessment.effectiveScore !== null || assessment.score !== null ? (
            <p className="text-sm leading-5 font-medium tabular-nums">
              {formatScore(
                assessment.effectiveScore ?? assessment.score,
                data.assignment.points,
              )}
            </p>
          ) : null}
          <RubricResult data={data} scores={assessment.rubricScores} />
          {assessment.feedback ? (
            <p dir="auto" className="text-sm leading-5 whitespace-pre-wrap">
              {assessment.feedback}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function YourWork({ data }: { data: Data }) {
  const queryClient = useQueryClient();
  const media = useDocumentMedia({ type: "work", id: data.assignment.id });
  const format = data.assignment.submissionFormat;
  const editable = data.canHandIn;
  const [content, setContent] = useState<ContentDocument>(
    data.submission.content ?? emptyContent(),
  );
  // Hand-in waits for files still uploading into the answer.
  const [uploading, setUploading] = useState(false);
  const [version, setVersion] = useState(data.submission.version);
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const standing = useQuery(myStandingQuery(data.assignment.id)).data;
  const declaring = Boolean(standing?.declarationRequired);
  const [declaration, setDeclaration] = useState(NO_DECLARATION);
  const [tried, setTried] = useState(false);
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["coursework"] }),
      queryClient.invalidateQueries({ queryKey: ["exams"] }),
    ]);
  const save = useMutation({
    mutationFn: () =>
      saveMyDraft({
        data: {
          assignmentId: data.assignment.id,
          expectedVersion: version,
          content: format === "none" ? null : content,
        },
      }),
    onSuccess: (saved) => {
      setVersion(saved.version);
      setDirty(false);
    },
  });
  const handIn = useMutation({
    mutationFn: async () => {
      let current = version;
      if (dirty || format === "none") {
        if (format !== "none") current = (await save.mutateAsync()).version;
      }
      return handInWork({
        data: {
          assignmentId: data.assignment.id,
          expectedVersion: current,
          ...(declaring && declarationReady(declaration)
            ? { declaration }
            : {}),
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
        {editable && format !== "none" ? (
          <FormField
            id="your-work"
            label={
              format === "files"
                ? m.courseworkYourFiles()
                : m.courseworkWriteHere()
            }
            hint={
              format === "online" ? undefined : m.courseworkFilesInAnswerHint()
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
                  onChange={(value) => {
                    setContent(value);
                    setDirty(true);
                  }}
                  onUploadingChange={setUploading}
                  media={media}
                  aiUse
                />
              </div>
            )}
          </FormField>
        ) : null}
        <div className="flex flex-wrap gap-2">
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
          {editable && format !== "none" ? (
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              disabled={!dirty || save.isPending}
              onClick={async () => {
                try {
                  await save.mutateAsync();
                  toast.success(m.courseworkDraftSaved());
                } catch (error) {
                  toast.error(getMessageFromError(error));
                }
              }}
            >
              <Save aria-hidden />
              {m.courseworkSaveWork()}
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
        </div>
      </div>
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
          setTried(true);
          if (declaring && !declarationReady(declaration)) return;
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
        {declaring && standing ? (
          <DeclarationFields
            value={declaration}
            onChange={setDeclaration}
            evidenceRequired={standing.aiEvidenceRequired}
            tried={tried}
          />
        ) : null}
      </SheetForm>
    </RecordSection>
  );
}

/** Work a teacher handed in for the student still waits for their declaration. */
function OutstandingDeclaration({ data }: { data: Data }) {
  const standing = useQuery(myStandingQuery(data.assignment.id)).data;
  const [open, setOpen] = useState(false);
  if (
    !standing?.declarationRequired ||
    !standing.latestAttemptId ||
    standing.latestDeclared
  )
    return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4">
      <p className="text-sm leading-5">{m.declarationOutstanding()}</p>
      <Button
        type="button"
        className="max-md:h-10"
        onClick={() => setOpen(true)}
      >
        {m.declarationSign()}
      </Button>
      <DeclareSheet
        open={open}
        attemptId={standing.latestAttemptId}
        evidenceRequired={standing.aiEvidenceRequired}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

export function LearnerWork({ assignmentId }: { assignmentId: string }) {
  const data = useSuspenseQuery(myWorkQuery(assignmentId)).data;
  const user = useCurrentUser();
  const width = useReaderWidth();
  const standing = useQuery(myStandingQuery(assignmentId)).data;
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
        date: formatInstant(data.assignment.dueAt, user.school.timeZone),
      }),
    });
  if (data.assignment.points !== null)
    facts.push({
      label: m.courseworkPoints(),
      value: m.courseworkPointsCount({ count: data.assignment.points }),
    });
  if (standing?.session)
    facts.push({
      label: m.courseworkExamFact(),
      value: isolatedLine([sessionName(standing.session), standing.component]),
    });
  return (
    <div
      className={cn(
        "mx-auto grid w-full gap-6",
        width.wide ? "max-w-none" : "max-w-[720px]",
      )}
    >
      <RecordHeader
        variant="document"
        title={data.assignment.title}
        facts={facts}
        tools={<ReaderWidthToggle wide={width.wide} onToggle={width.toggle} />}
        status={{
          label: STATE_LABEL[data.state](),
          tone: STATE_TONE[data.state],
        }}
      />
      {data.brief ? (
        <ContentView document={data.brief} fileUrl={(id) => `/files/${id}`} />
      ) : (
        <RecordEmpty>{m.courseworkNoBrief()}</RecordEmpty>
      )}
      {data.quiz ? (
        <QuizWork key={data.attempts.length} data={data} />
      ) : (
        <YourWork
          key={`${data.submission.version}-${data.attempts.length}`}
          data={data}
        />
      )}
      {data.quiz ? null : <OutstandingDeclaration data={data} />}
      {data.attempts.length > 0 ? (
        <RecordSection variant="page" title={m.courseworkAttempts()}>
          <RecordList>
            {data.attempts.toReversed().map((attempt) => (
              <AttemptItem key={attempt.id} data={data} attempt={attempt} />
            ))}
          </RecordList>
        </RecordSection>
      ) : null}
    </div>
  );
}
