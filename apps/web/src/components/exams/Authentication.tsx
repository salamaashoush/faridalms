import { Button } from "@faridalms/ui/button";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileCheck, Paperclip, ShieldAlert, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { FormField } from "~/components/system/field";
import { SheetForm } from "~/components/system/SheetForm";
import { StatusText } from "~/components/system/status";
import { inLocale } from "~/hooks/useCurrentUser";
import { useDocumentMedia } from "~/hooks/useDocumentMedia";
import * as m from "~/i18n/messages";
import { workStandingQuery } from "~/queries/exams";
import { authenticateWork, recordPaperDeclaration } from "~/server/exams";
import { formatInstant, formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { isolatedLine, sessionName } from "./names";

type Standing = NonNullable<
  Awaited<
    ReturnType<NonNullable<ReturnType<typeof workStandingQuery>["queryFn"]>>
  >
>;
export type StudentStanding = Standing["students"][number];
type Marks = Pick<
  StudentStanding,
  "attemptId" | "declaration" | "authentication"
>;

function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["exams"] }),
      queryClient.invalidateQueries({ queryKey: ["coursework"] }),
    ]);
}

/** Where a student's declaration stands, with when and whether AI was used. */
export function DeclarationStatus({ student }: { student: Marks }) {
  const declaration = student.declaration;
  if (!student.attemptId)
    return <StatusText tone="neutral">{m.courseworkNotHandedIn()}</StatusText>;
  if (!declaration)
    return (
      <StatusText tone="warning">{m.declarationOutstandingShort()}</StatusText>
    );
  const detail = [
    declaration.kind === "student"
      ? m.declarationSignedOn({
          date: formatInstant(declaration.declaredAt),
        })
      : null,
    declaration.aiUsed ? m.declarationUsedAi() : null,
  ].filter(Boolean);
  return (
    <span className="grid gap-0.5">
      <StatusText tone="success">
        {declaration.kind === "paper"
          ? m.declarationOnPaper()
          : m.declarationDeclared()}
      </StatusText>
      {detail.length ? (
        <span className="ps-4 text-[13px] leading-[18px] text-muted-foreground">
          {detail.join(" · ")}
        </span>
      ) : null}
    </span>
  );
}

/** The teacher's word on the work, in a line. */
export function AuthenticationStatus({ student }: { student: Marks }) {
  const authentication = student.authentication;
  if (!authentication)
    return (
      <StatusText tone="neutral">{m.authenticationOutstanding()}</StatusText>
    );
  return authentication.outcome === "confirmed" ? (
    <StatusText tone="success">{m.authenticationConfirmed()}</StatusText>
  ) : (
    <StatusText tone="danger">{m.authenticationNotConfirmed()}</StatusText>
  );
}

function PaperSheet({
  open,
  attemptId,
  onClose,
}: {
  open: boolean;
  attemptId: string;
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const media = useDocumentMedia();
  const input = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState<{ fileId: string; name: string } | null>(
    null,
  );
  const [uploading, setUploading] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      recordPaperDeclaration({
        data: { attemptId, ...(scan ? { scanFileId: scan.fileId } : {}) },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={m.declarationRecordPaper()}
      submitLabel={m.declarationRecordPaper()}
      pending={mutation.isPending || uploading}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        try {
          await mutation.mutateAsync();
        } catch {
          return;
        }
        await refresh();
        toast.success(m.declarationRecorded());
        onClose();
      }}
    >
      <p className="text-sm leading-5 text-muted-foreground">
        {m.declarationPaperHint()}
      </p>
      <div className="grid gap-2">
        <p className="text-sm leading-5 font-medium">
          {m.declarationScan()}{" "}
          <span className="font-normal text-muted-foreground">
            {m.formOptionalSuffix()}
          </span>
        </p>
        {scan ? (
          <p className="flex items-center gap-2 text-sm leading-5">
            <FileCheck className="size-4 text-muted-foreground" aria-hidden />
            <bdi>{scan.name}</bdi>
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="justify-self-start max-md:h-10"
          disabled={uploading}
          onClick={() => input.current?.click()}
        >
          <Paperclip aria-hidden />
          {scan ? m.declarationScanReplace() : m.declarationScanAdd()}
        </Button>
        <input
          ref={input}
          type="file"
          hidden
          tabIndex={-1}
          aria-hidden
          accept={[...media.accept.image, ".pdf"].join(",")}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setUploading(true);
            try {
              const stored = await media.upload(file, "file");
              setScan({ fileId: stored.fileId, name: stored.name });
            } catch (error) {
              toast.error(getMessageFromError(error));
            } finally {
              setUploading(false);
            }
          }}
        />
      </div>
    </SheetForm>
  );
}

function AuthenticateSheet({
  open,
  attemptId,
  outcome,
  onClose,
}: {
  open: boolean;
  attemptId: string;
  outcome: "confirmed" | "not_confirmed";
  onClose: () => void;
}) {
  const refresh = useRefresh();
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const confirming = outcome === "confirmed";
  const mutation = useMutation({
    mutationFn: () =>
      authenticateWork({
        data: { attemptId, outcome, note: note.trim() || null },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={
        confirming
          ? m.authenticationConfirmTitle()
          : m.authenticationCannotTitle()
      }
      submitLabel={
        confirming ? m.authenticationConfirm() : m.authenticationCannot()
      }
      pending={mutation.isPending}
      error={mutation.error ? getMessageFromError(mutation.error) : null}
      onSubmit={async () => {
        setTried(true);
        if (!confirming && !note.trim()) return;
        try {
          await mutation.mutateAsync();
        } catch {
          return;
        }
        await refresh();
        toast.success(
          confirming
            ? m.authenticationConfirmedDone()
            : m.authenticationReported(),
        );
        onClose();
      }}
    >
      {confirming ? (
        <ul className="grid list-disc gap-1.5 ps-5 text-sm leading-5">
          <li>{m.authenticationOwnWork()}</li>
          <li>{m.authenticationConditions()}</li>
          <li>{m.authenticationMarked()}</li>
        </ul>
      ) : (
        <p className="text-sm leading-5 text-muted-foreground">
          {m.authenticationCannotHint()}
        </p>
      )}
      <FormField
        id="authentication-note"
        label={confirming ? m.authenticationHelp() : m.authenticationReason()}
        hint={confirming ? m.authenticationHelpHint() : undefined}
        optional={confirming}
        errors={
          tried && !confirming && !note.trim()
            ? [m.authenticationReasonNeeded()]
            : undefined
        }
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={4}
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}

/**
 * Assessed coursework beside the grade: the session it counts for, the
 * student's declaration and the teacher's word on the work, which a grade
 * waits for before it goes back.
 */
export function CourseworkStanding({
  assignmentId,
  studentId,
}: {
  assignmentId: string;
  studentId: string;
}) {
  const standing = useQuery(workStandingQuery(assignmentId)).data;
  // A sheet keeps its content while it closes; each opening starts afresh.
  const [sheet, setSheet] = useState<{
    kind: "paper" | "confirmed" | "not_confirmed";
    generation: number;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const show = (kind: "paper" | "confirmed" | "not_confirmed") => {
    setSheet((current) => ({
      kind,
      generation: (current?.generation ?? 0) + 1,
    }));
    setOpen(true);
  };
  if (!standing) return null;
  const student = standing.students.find((row) => row.studentId === studentId);
  if (!student) return null;
  const authentication = student.authentication;
  const final = authentication?.outcome === "confirmed";
  const canAuthenticate =
    Boolean(student.attemptId) &&
    !final &&
    (Boolean(student.declaration) || !standing.declarationRequired);
  return (
    <section className="grid min-w-0 gap-3 border-b pb-4">
      <div className="grid gap-0.5">
        <h3 className="text-sm leading-5 font-medium">
          {m.courseworkAssessedTitle()}
        </h3>
        {standing.session ? (
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {isolatedLine([sessionName(standing.session), standing.component])}
          </p>
        ) : null}
      </div>
      {standing.declarationRequired ? (
        <div className="grid gap-1.5">
          <DeclarationStatus student={student} />
          {student.declaration?.scan ? (
            <a
              href={`/files/${student.declaration.scan.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-[13px] leading-[18px] underline-offset-4 hover:underline"
            >
              <bdi>{student.declaration.scan.name}</bdi>
            </a>
          ) : null}
          {student.attemptId && !student.declaration ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-self-start max-md:h-10"
              onClick={() => show("paper")}
            >
              {m.declarationRecordPaper()}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <AuthenticationStatus student={student} />
        {authentication ? (
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {m.authenticationBy({
              name: inLocale(
                authentication.teacherEn,
                authentication.teacherAr,
              ),
              date: formatDate(authentication.at),
            })}
          </p>
        ) : null}
        {authentication?.note ? (
          <q dir="auto" className="text-sm leading-5">
            {authentication.note}
          </q>
        ) : null}
        {final ? (
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {m.authenticationFinal()}
          </p>
        ) : null}
        {canAuthenticate ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="max-md:h-10"
              onClick={() => show("confirmed")}
            >
              <ShieldCheck aria-hidden />
              {m.authenticationConfirm()}
            </Button>
            {authentication ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="max-md:h-10"
                onClick={() => show("not_confirmed")}
              >
                <ShieldAlert aria-hidden />
                {m.authenticationCannot()}
              </Button>
            )}
          </div>
        ) : student.attemptId && !final ? (
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {m.authenticationAfterDeclaration()}
          </p>
        ) : null}
      </div>
      {student.attemptId && sheet?.kind === "paper" ? (
        <PaperSheet
          key={sheet.generation}
          open={open}
          attemptId={student.attemptId}
          onClose={() => setOpen(false)}
        />
      ) : student.attemptId && sheet ? (
        <AuthenticateSheet
          key={sheet.generation}
          open={open}
          attemptId={student.attemptId}
          outcome={sheet.kind === "paper" ? "confirmed" : sheet.kind}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </section>
  );
}

/** Where a student's assessed coursework stands, for a list of the class's work. */
export function CourseworkMarks({
  student,
  declarationRequired,
}: {
  student: Marks;
  declarationRequired: boolean;
}) {
  const step = courseworkStep(student, declarationRequired);
  return step ? <StatusText tone={step.tone}>{step.label}</StatusText> : null;
}

/** The one step a student's coursework waits on, or its outcome once done. */
export function courseworkStep(
  student: Marks,
  declarationRequired: boolean,
): {
  tone: "warning" | "neutral" | "success" | "danger";
  label: string;
} | null {
  if (!student.attemptId) return null;
  if (declarationRequired && !student.declaration)
    return { tone: "warning", label: m.declarationUndeclared() };
  if (!student.authentication)
    return { tone: "neutral", label: m.authenticationToConfirm() };
  return student.authentication.outcome === "confirmed"
    ? { tone: "success", label: m.authenticationConfirmed() }
    : { tone: "danger", label: m.authenticationNotConfirmed() };
}
