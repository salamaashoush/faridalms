import type {
  Decision,
  EventKind,
  OfferAnswer,
} from "@faridalms/domain/admissions";
import type {
  ActionItem,
  PrimaryAction,
} from "@faridalms/ui/system/action-menu";

import { DECISIONS, EVENT_KINDS } from "@faridalms/domain/admissions";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@faridalms/ui/dialog";
import {
  ChoiceField,
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import {
  Fact,
  Facts,
  RecordEmpty,
  RecordSection,
} from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  CalendarPlus,
  CheckCheck,
  FileText,
  Gavel,
  GraduationCap,
  MessageSquareReply,
  Send,
  Undo2,
  XCircle,
} from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import type { applicationQuery } from "~/queries/admissions";

import { ContentView } from "~/components/content/ContentView";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { attendeesQuery, letterQuery } from "~/queries/admissions";
import {
  answerForFamily,
  convertApplications,
  decideApplications,
  deferApplication,
  offerPlaces,
  recordAdmissionEvent,
  refusePlaces,
  releaseDecisions,
  reopenApplications,
  saveAdmissionEvent,
} from "~/server/admissions";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import {
  DECISION_HINT,
  DECISION_LABEL,
  EVENT_KIND_LABEL,
  EVENT_OUTCOME_LABEL,
  EVENT_OUTCOME_TONE,
  LETTER_LABEL,
} from "./application-labels";

export type Application = Awaited<
  ReturnType<NonNullable<ReturnType<typeof applicationQuery>["queryFn"]>>
>;

function useRefresh() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["admissions"] });
}

const one = (row: Application) => [
  { id: row.id, expectedVersion: row.version },
];

export interface DecideSheetProps {
  applications: { id: string; expectedVersion: number }[];
  current?: Decision | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}

/** Chooses a decision for applications under review; the families hear nothing until it is released. */
export function DecideSheet({
  applications,
  current,
  open,
  onOpenChange,
  onDone,
}: DecideSheetProps) {
  const refresh = useRefresh();
  const [decision, setDecision] = useState<Decision>(current ?? "offer");
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () =>
      decideApplications({
        data: { applications, decision, note: note.trim() },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) save.reset();
        onOpenChange(next);
      }}
      title={
        applications.length > 1
          ? m.decDecideMany({ count: applications.length })
          : m.decDecideTitle()
      }
      submitLabel={m.decDecideAction()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={async () => {
        let result;
        try {
          result = await save.mutateAsync();
        } catch {
          return;
        }
        await refresh();
        toast.success(
          result.released.length
            ? m.decDecidedReleased({ count: result.released.length })
            : m.decDecided({ count: result.decided }),
        );
        onOpenChange(false);
        onDone?.();
      }}
    >
      <p className="text-sm text-muted-foreground">{m.decDecideHint()}</p>
      <ChoiceField
        label={m.decDecisionLabel()}
        value={decision}
        options={DECISIONS.map((value) => ({
          value,
          label: DECISION_LABEL[value](),
          hint: DECISION_HINT[value](),
        }))}
        onChange={setDecision}
      />
      <FormField id="decision-note" label={m.admFieldNote()} optional>
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}

interface AnswerSheetProps {
  row: Application;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Records what a family told the office about their offer. */
function AnswerSheet({ row, open, onOpenChange }: AnswerSheetProps) {
  const refresh = useRefresh();
  const [answer, setAnswer] = useState<OfferAnswer>("accept");
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () =>
      answerForFamily({
        data: {
          id: row.id,
          expectedVersion: row.version,
          answer,
          note: note.trim(),
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={m.decAnswerTitle()}
      submitLabel={m.decAnswerSave()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={async () => {
        try {
          await save.mutateAsync();
        } catch {
          return;
        }
        await refresh();
        toast.success(m.decAnswerSaved());
        onOpenChange(false);
      }}
    >
      <ChoiceField
        label={m.decAnswerLabel()}
        value={answer}
        options={[
          { value: "accept" as const, label: m.decAnswerAccept() },
          { value: "decline" as const, label: m.decAnswerDecline() },
        ]}
        onChange={setAnswer}
      />
      <FormField id="answer-note" label={m.decAnswerNote()} optional>
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}

interface DeferSheetProps {
  row: Application;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Moves an application to an intake of a later year. */
function DeferSheet({ row, open, onOpenChange }: DeferSheetProps) {
  const refresh = useRefresh();
  const [intakeId, setIntakeId] = useState(row.laterIntakes[0]?.id ?? "");
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: () =>
      deferApplication({
        data: {
          id: row.id,
          expectedVersion: row.version,
          intakeId,
          note: note.trim(),
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={m.decDeferTitle()}
      submitLabel={m.decDeferAction()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={async () => {
        let moved;
        try {
          moved = await save.mutateAsync();
        } catch {
          return;
        }
        await refresh();
        toast.success(m.decDeferred({ reference: moved.reference }));
        onOpenChange(false);
      }}
    >
      <p className="text-sm text-muted-foreground">{m.decDeferHint()}</p>
      <SelectField
        id="defer-intake"
        label={m.decDeferIntake()}
        value={intakeId}
        options={row.laterIntakes.map((intake) => ({
          value: intake.id,
          label: inLocale(intake.titleEn, intake.titleAr),
        }))}
        onChange={setIntakeId}
      />
      <FormField id="defer-note" label={m.admFieldNote()} optional>
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}

interface EnrolSheetProps {
  row: Application;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Enrols an accepted applicant: as a new student under a reference, or as
 * the school's own student matching found, which the office confirms is
 * the same child. A summary says what enrolling does before it is done.
 */
function EnrolSheet({ row, open, onOpenChange }: EnrolSheetProps) {
  const refresh = useRefresh();
  const [studentId, setStudentId] = useState("");
  const [reference, setReference] = useState(row.reference ?? "");
  const save = useMutation({
    mutationFn: () =>
      convertApplications({
        data: {
          applications: [
            {
              id: row.id,
              expectedVersion: row.version,
              studentId,
              reference: studentId ? "" : reference.trim(),
            },
          ],
        },
      }),
    meta: { inlineError: true },
  });
  const intake = inLocale(row.intake.titleEn, row.intake.titleAr);
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={m.decEnrolTitle()}
      submitLabel={m.decEnrolAction()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={async () => {
        try {
          await save.mutateAsync();
        } catch {
          return;
        }
        await refresh();
        toast.success(m.decEnrolled());
        onOpenChange(false);
      }}
    >
      {row.matches.students.length ? (
        <ChoiceField
          label={m.decEnrolWho()}
          value={studentId}
          options={[
            {
              value: "",
              label: m.decEnrolNew(),
              hint: m.decEnrolNewHint(),
            },
            ...row.matches.students.map((each) => ({
              value: each.id,
              label: inLocale(each.nameEn, each.nameAr),
              hint: m.decEnrolSameHint(),
            })),
          ]}
          onChange={setStudentId}
        />
      ) : null}
      {studentId ? null : (
        <TextField
          id="enrol-reference"
          label={m.decEnrolReference()}
          hint={m.decEnrolReferenceHint()}
          width="reference"
          dir="ltr"
          maxLength={24}
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
      )}
      <div className="grid gap-2 rounded-lg border bg-muted/40 p-4 text-sm">
        <p className="font-medium">{m.decEnrolSummary()}</p>
        <ul className="grid list-disc gap-1 ps-5 text-muted-foreground">
          <li>{m.decEnrolPlaced({ intake })}</li>
          <li>{m.decEnrolFamily()}</li>
          <li>{m.decEnrolCarried()}</li>
          <li>{m.decEnrolClosed()}</li>
        </ul>
      </div>
    </SheetForm>
  );
}

type EventRow = Application["events"][number];

interface EventSheetProps {
  row: Application;
  event: EventRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Books a tour, assessment or interview, or moves one still to happen. */
function EventSheet({ row, event, open, onOpenChange }: EventSheetProps) {
  const refresh = useRefresh();
  const team = useQuery(attendeesQuery).data ?? [];
  const steps = row.items.filter(
    (item) => item.kind === "assessment" || item.kind === "interview",
  );
  const [kind, setKind] = useState<EventKind>(event?.kind ?? "interview");
  const [itemId, setItemId] = useState(event?.itemId ?? "");
  const [date, setDate] = useState(event?.startsOn ?? "");
  const [startTime, setStartTime] = useState(event?.startTime ?? "10:00");
  const [endTime, setEndTime] = useState(event?.endTime ?? "10:30");
  const [location, setLocation] = useState(event?.location ?? "");
  const [attendees, setAttendees] = useState<string[]>(
    event?.attendees.map((each) => each.id) ?? [],
  );
  const save = useMutation({
    mutationFn: () =>
      saveAdmissionEvent({
        data: {
          applicationId: row.id,
          id: event?.id ?? "",
          expectedVersion: event?.version ?? 0,
          kind,
          itemId,
          date,
          startTime,
          endTime,
          location: location.trim(),
          attendeeIds: attendees,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={event ? m.decEventMove() : m.decEventBook()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={async () => {
        try {
          await save.mutateAsync();
        } catch {
          return;
        }
        await refresh();
        toast.success(m.decEventSaved());
        onOpenChange(false);
      }}
    >
      <SelectField
        id="event-kind"
        label={m.decEventKind()}
        value={kind}
        options={EVENT_KINDS.map((value) => ({
          value,
          label: EVENT_KIND_LABEL[value](),
        }))}
        onChange={setKind}
      />
      {steps.length ? (
        <SelectField
          id="event-step"
          label={m.decEventStep()}
          optional
          value={itemId}
          options={[
            { value: "", label: m.decEventNoStep() },
            ...steps.map((item) => ({
              value: item.id,
              label: inLocale(item.labelEn || null, item.labelAr || null),
            })),
          ]}
          onChange={setItemId}
        />
      ) : null}
      <TextField
        id="event-date"
        type="date"
        label={m.decEventDate()}
        width="date"
        value={date}
        onChange={(change) => setDate(change.target.value)}
      />
      <div className="grid grid-cols-2 gap-4">
        <TextField
          id="event-start"
          type="time"
          label={m.decEventStart()}
          value={startTime}
          onChange={(change) => setStartTime(change.target.value)}
        />
        <TextField
          id="event-end"
          type="time"
          label={m.decEventEnd()}
          value={endTime}
          onChange={(change) => setEndTime(change.target.value)}
        />
      </div>
      <TextField
        id="event-location"
        label={m.decEventLocation()}
        optional
        maxLength={200}
        value={location}
        onChange={(change) => setLocation(change.target.value)}
      />
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-medium">
          {m.decEventAttendees()}
        </legend>
        {team.map((person) => (
          <label key={person.id} className="flex items-center gap-3 text-sm">
            <Checkbox
              checked={attendees.includes(person.id)}
              onCheckedChange={(checked) =>
                setAttendees((current) =>
                  checked
                    ? [...current, person.id]
                    : current.filter((id) => id !== person.id),
                )
              }
            />
            <bdi>{inLocale(person.nameEn, person.nameAr)}</bdi>
          </label>
        ))}
      </fieldset>
    </SheetForm>
  );
}

interface OutcomeSheetProps {
  row: Application;
  event: EventRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Records what came of an event, with the office's notes. */
function OutcomeSheet({ row, event, open, onOpenChange }: OutcomeSheetProps) {
  const refresh = useRefresh();
  const [outcome, setOutcome] = useState<"attended" | "missed" | "cancelled">(
    "attended",
  );
  const [result, setResult] = useState("");
  const save = useMutation({
    mutationFn: () =>
      recordAdmissionEvent({
        data: {
          applicationId: row.id,
          id: event.id,
          expectedVersion: event.version,
          outcome,
          result: result.trim(),
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={onOpenChange}
      title={m.decOutcomeTitle({ event: EVENT_KIND_LABEL[event.kind]() })}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={async () => {
        try {
          await save.mutateAsync();
        } catch {
          return;
        }
        await refresh();
        toast.success(m.decOutcomeSaved());
        onOpenChange(false);
      }}
    >
      <ChoiceField
        label={m.decOutcomeLabel()}
        value={outcome}
        options={(["attended", "missed", "cancelled"] as const).map(
          (value) => ({ value, label: EVENT_OUTCOME_LABEL[value]() }),
        )}
        onChange={setOutcome}
      />
      <FormField id="event-result" label={m.decOutcomeResult()} optional>
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={5}
            maxLength={2000}
            value={result}
            onChange={(change) => setResult(change.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}

interface LetterBodyProps {
  id: string;
  reader: "office" | "family";
}

function LetterBody({ id, reader }: LetterBodyProps) {
  const letter = useSuspenseQuery(letterQuery(id, reader)).data;
  return (
    <div
      dir={letter.locale === "ar" ? "rtl" : "ltr"}
      lang={letter.locale}
      className="max-h-[60vh] overflow-y-auto"
    >
      <ContentView document={letter.content} lang={letter.locale} />
    </div>
  );
}

export interface LetterDialogProps {
  letter: { id: string; title: string; createdAt: string } | null;
  reader: "office" | "family";
  onClose: () => void;
}

/** A letter as the family was sent it. */
export function LetterDialog({ letter, reader, onClose }: LetterDialogProps) {
  return (
    <Dialog open={letter !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        {letter ? (
          <>
            <DialogTitle dir="auto">{letter.title}</DialogTitle>
            <DialogDescription>
              {m.decLetterSent({
                date: formatDate(letter.createdAt.slice(0, 10)),
              })}
            </DialogDescription>
            <Suspense fallback={null}>
              <LetterBody id={letter.id} reader={reader} />
            </Suspense>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export interface LettersSectionProps {
  row: Application;
}

/** The letters the family was sent, each opened as they read it. */
export function LettersSection({ row }: LettersSectionProps) {
  const [open, setOpen] = useState<Application["letters"][number] | null>(null);
  return (
    <RecordSection title={m.decLettersTitle()} description={m.decLettersHint()}>
      {row.letters.length ? (
        <ul className="-my-2 divide-y">
          {row.letters.map((letter) => (
            <li key={letter.id} className="flex items-center gap-3 py-2">
              <FileText aria-hidden className="size-4 text-muted-foreground" />
              <button
                type="button"
                className="min-w-0 truncate text-start text-sm font-medium text-primary hover:underline max-md:min-h-10"
                onClick={() => setOpen(letter)}
              >
                <bdi>{letter.title}</bdi>
              </button>
              <span className="ms-auto shrink-0 text-[13px] text-muted-foreground">
                {LETTER_LABEL[letter.kind]()} ·{" "}
                {formatDate(letter.createdAt.slice(0, 10))}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <RecordEmpty>{m.decLettersNone()}</RecordEmpty>
      )}
      <LetterDialog
        letter={open}
        reader="office"
        onClose={() => setOpen(null)}
      />
    </RecordSection>
  );
}

export interface EventsSectionProps {
  row: Application;
}

/** Tours, assessments and interviews booked for the application. */
export function EventsSection({ row }: EventsSectionProps) {
  const [editing, setEditing] = useState<EventRow | "new" | null>(null);
  const [recording, setRecording] = useState<EventRow | null>(null);
  const open = row.manages && row.state !== "draft" && row.studentId === null;
  return (
    <RecordSection
      title={m.decEventsTitle()}
      description={m.decEventsHint()}
      action={
        open ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditing("new")}
          >
            <CalendarPlus aria-hidden className="size-4" />
            {m.decEventBook()}
          </Button>
        ) : undefined
      }
    >
      {row.events.length ? (
        <ul className="-my-3 divide-y">
          {row.events.map((event) => (
            <li key={event.id} className="grid gap-1 py-3">
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-medium">
                  {EVENT_KIND_LABEL[event.kind]()}
                </span>
                <StatusText tone={EVENT_OUTCOME_TONE[event.outcome]}>
                  {EVENT_OUTCOME_LABEL[event.outcome]()}
                </StatusText>
              </span>
              <span className="text-[13px] text-muted-foreground">
                {m.decEventWhen({
                  date: formatDate(event.startsOn),
                  from: event.startTime,
                  to: event.endTime,
                })}
                {event.location ? (
                  <>
                    {" · "}
                    <bdi>{event.location}</bdi>
                  </>
                ) : null}
              </span>
              {event.attendees.length ? (
                <span className="text-[13px] text-muted-foreground">
                  {m.decEventWith({
                    people: event.attendees
                      .map((each) => inLocale(each.nameEn, each.nameAr))
                      .join("، "),
                  })}
                </span>
              ) : null}
              {event.result ? (
                <p dir="auto" className="text-sm whitespace-pre-line">
                  {event.result}
                </p>
              ) : null}
              {open && event.outcome === "scheduled" ? (
                <span className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setRecording(event)}
                  >
                    {m.decOutcomeRecord()}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(event)}
                  >
                    {m.decEventMove()}
                  </Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <RecordEmpty>{m.decEventsNone()}</RecordEmpty>
      )}
      {editing ? (
        <EventSheet
          key={editing === "new" ? "new" : editing.id}
          row={row}
          event={editing === "new" ? null : editing}
          open
          onOpenChange={(next) => !next && setEditing(null)}
        />
      ) : null}
      {recording ? (
        <OutcomeSheet
          key={recording.id}
          row={row}
          event={recording}
          open
          onOpenChange={(next) => !next && setRecording(null)}
        />
      ) : null}
    </RecordSection>
  );
}

export interface DecisionSectionProps {
  row: Application;
}

/** Where the decision stands: what was decided, whether the family knows, and the offer's days. */
export function DecisionSection({ row }: DecisionSectionProps) {
  if (!row.decision && !row.deferredFromId && !row.deferredToId) return null;
  return (
    <RecordSection title={m.decSectionTitle()}>
      <Facts>
        {row.decision ? (
          <Fact label={m.decDecisionLabel()} wide>
            {DECISION_LABEL[row.decision]()}
          </Fact>
        ) : null}
        {row.decision ? (
          <Fact label={m.decReleased()} wide>
            {row.releasedAt
              ? formatDate(row.releasedAt.slice(0, 10))
              : row.state === "decided"
                ? m.decNotReleased()
                : null}
          </Fact>
        ) : null}
        {row.offerExpiresOn ? (
          <Fact label={m.decOfferUntil()} wide>
            {formatDate(row.offerExpiresOn)}
          </Fact>
        ) : null}
        {row.answeredAt ? (
          <Fact label={m.decAnswered()} wide>
            {formatDate(row.answeredAt.slice(0, 10))}
          </Fact>
        ) : null}
        {row.studentId ? (
          <Fact label={m.decStudent()} wide>
            <Link
              to="/students/$studentId"
              params={{ studentId: row.studentId }}
              className="text-primary hover:underline"
            >
              {m.decOpenStudent()}
            </Link>
          </Fact>
        ) : null}
        {row.deferredFromId ? (
          <Fact label={m.decDeferredFrom()} wide>
            <Link
              to="/admissions/applications/$applicationId"
              params={{ applicationId: row.deferredFromId }}
              className="text-primary hover:underline"
            >
              {m.decOpenApplication()}
            </Link>
          </Fact>
        ) : null}
        {row.deferredToId ? (
          <Fact label={m.decDeferredTo()} wide>
            <Link
              to="/admissions/applications/$applicationId"
              params={{ applicationId: row.deferredToId }}
              className="text-primary hover:underline"
            >
              {m.decOpenApplication()}
            </Link>
          </Fact>
        ) : null}
      </Facts>
    </RecordSection>
  );
}

/**
 * What the office can do next with an application, by where it stands and
 * what the viewer may do: the one primary action for its phase, the rest in
 * the menu, each opening the sheet or confirmation it needs.
 */
export function useDecisionActions(row: Application): {
  action?: PrimaryAction;
  menu: ActionItem[];
  sheets: React.ReactNode;
} {
  const refresh = useRefresh();
  const [sheet, setSheet] = useState<
    "decide" | "answer" | "defer" | "enrol" | null
  >(null);
  const report = (work: () => Promise<unknown>, done: string) =>
    work().then(
      async () => {
        await refresh();
        toast.success(done);
      },
      (error: unknown) => toast.error(getMessageFromError(error)),
    );
  const can = (state: Application["moves"][number]) =>
    row.moves.includes(state);
  const release = () =>
    report(
      () => releaseDecisions({ data: { applications: one(row) } }),
      m.decReleasedToast({ count: 1 }),
    );
  const offer = () =>
    report(
      () => offerPlaces({ data: { applications: one(row) } }),
      m.decOffered({ count: 1 }),
    );
  let action: PrimaryAction | undefined;
  const menu: ActionItem[] = [];
  if (row.state === "in_review" && can("decided"))
    action = {
      label: m.decDecideAction(),
      icon: Gavel,
      onClick: () => setSheet("decide"),
    };
  if (row.state === "decided" && can("offered")) {
    action = {
      label: m.decRelease(),
      icon: Send,
      onClick: () => void release(),
    };
    menu.push(
      {
        label: m.decChange(),
        icon: Gavel,
        onSelect: () => setSheet("decide"),
      },
      {
        label: m.decReopen(),
        icon: Undo2,
        onSelect: () =>
          report(
            () => reopenApplications({ data: { applications: one(row) } }),
            m.decReopened(),
          ),
      },
    );
  }
  if (row.state === "waitlisted" && can("offered")) {
    action = {
      label: m.decOfferPlace(),
      icon: CheckCheck,
      onClick: () => void offer(),
    };
    menu.push({
      label: m.decRefuse(),
      icon: XCircle,
      confirm: {
        title: m.decRefuseTitle(),
        body: m.decRefuseBody(),
        label: m.decRefuse(),
      },
      onSelect: () =>
        report(
          () => refusePlaces({ data: { applications: one(row) } }),
          m.decRefused(),
        ),
    });
  }
  if (row.state === "offered" && can("accepted"))
    menu.push({
      label: m.decAnswerTitle(),
      icon: MessageSquareReply,
      onSelect: () => setSheet("answer"),
    });
  if (row.state === "accepted" && can("enrolled"))
    action = {
      label: m.decEnrolAction(),
      icon: GraduationCap,
      onClick: () => setSheet("enrol"),
    };
  if (can("deferred") && row.laterIntakes.length)
    menu.push({
      label: m.decDeferAction(),
      icon: ArrowRightLeft,
      onSelect: () => setSheet("defer"),
    });
  return {
    action,
    menu,
    sheets: (
      <>
        {sheet === "decide" ? (
          <DecideSheet
            applications={one(row)}
            current={row.decision}
            open
            onOpenChange={(next) => !next && setSheet(null)}
          />
        ) : null}
        {sheet === "answer" ? (
          <AnswerSheet
            row={row}
            open
            onOpenChange={(next) => !next && setSheet(null)}
          />
        ) : null}
        {sheet === "defer" ? (
          <DeferSheet
            row={row}
            open
            onOpenChange={(next) => !next && setSheet(null)}
          />
        ) : null}
        {sheet === "enrol" ? (
          <EnrolSheet
            row={row}
            open
            onOpenChange={(next) => !next && setSheet(null)}
          />
        ) : null}
      </>
    ),
  };
}
