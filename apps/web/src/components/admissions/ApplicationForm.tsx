import type { Needs, PreviousSchool } from "@faridalms/domain/admissions";
import type { FileSummary } from "@faridalms/domain/file";
import type { LessonResponse } from "@faridalms/domain/learning";
import type { PersonNamesInput } from "@faridalms/domain/people";
import type { FormQuestion } from "@faridalms/domain/questions";
import type { ContentLocale } from "@faridalms/domain/translations";

import {
  MAX_FILES_PER_ITEM,
  MAX_PREVIOUS_SCHOOLS,
  NEEDS_KINDS,
  questionsIn,
} from "@faridalms/domain/admissions";
import {
  answerLimit,
  formQuestions,
  formResponse,
  formValue,
  readFormAnswers,
} from "@faridalms/domain/questions";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import {
  CheckboxGroupField,
  ChoiceField,
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { FormSection } from "@faridalms/ui/system/record-form";
import { StatusText } from "@faridalms/ui/system/status";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CalendarX,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { TranslatedView } from "~/components/content/TranslatedView";
import { FileField } from "~/components/system/FileField";
import { inLocale } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { draftQuery, myApplicationsQuery } from "~/queries/admissions";
import {
  attachDocument,
  detachDocument,
  saveDraft,
  startApplication,
  submitApplication,
} from "~/server/admissions";
import { applyAs } from "~/server/auth";
import { formatAmount, formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { useWords } from "~/utils/words";

import type {
  ApplicationAnswers,
  ApplicationDraft,
  Names,
} from "./apply-parts";

import {
  AGE_LABEL,
  FEE_KIND_LABEL,
  ITEM_STATE_LABEL,
  ITEM_STATE_TONE,
  NEEDS_HINT,
  NEEDS_LABEL,
  named,
} from "./application-labels";
import {
  hasName,
  NamesFields,
  noNames,
  text,
  useApplyingWords,
} from "./apply-parts";
import { applicationSteps, previousSchoolGrades } from "./slots";

const APPLY_STEPS = [
  "child",
  "schools",
  "needs",
  "questions",
  "documents",
  "send",
] as const;
type ApplyStep = (typeof APPLY_STEPS)[number];

const STEP_LABEL: Record<ApplyStep, () => string> = {
  child: m.applyStepChildCore,
  schools: m.applyStepSchools,
  needs: m.applyStepNeeds,
  questions: m.applyStepQuestions,
  documents: m.applyStepDocuments,
  send: m.applyStepSend,
};

const isApplyStep = (step: string): step is ApplyStep =>
  (APPLY_STEPS as readonly string[]).includes(step);

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

type Mine = Awaited<
  ReturnType<NonNullable<(typeof myApplicationsQuery)["queryFn"]>>
>;

interface ChildDraft {
  names: Names;
  birthDate: string;
  sexId: string;
  documentSystemId: string;
  documentNumber: string;
  documentCountry: string;
}

interface ChildFieldsProps {
  child: ChildDraft;
  options: Mine["options"];
  onChange: (child: ChildDraft) => void;
  tried: boolean;
  documentShown?: string | null;
}

function ChildFields({
  child,
  options,
  onChange,
  tried,
  documentShown,
}: ChildFieldsProps) {
  const set = <K extends keyof ChildDraft>(key: K, value: ChildDraft[K]) =>
    onChange({ ...child, [key]: value });
  return (
    <>
      <NamesFields
        id="child"
        names={child.names}
        onChange={(names) => set("names", names)}
        error={tried && !hasName(child.names) ? m.applyErrName() : null}
      />
      <div className="flex flex-wrap gap-4">
        <TextField
          id="child-birth"
          label={m.aplFieldBirthDate()}
          type="date"
          width="date"
          value={child.birthDate}
          onChange={(event) => set("birthDate", event.target.value)}
          errors={tried && !child.birthDate ? [m.applyErrBirth()] : undefined}
        />
        <SelectField
          id="child-sex"
          label={m.aplFieldSex()}
          value={child.sexId}
          options={[
            { value: "", label: m.applyChoose() },
            ...options.sexes.map((row) => ({
              value: row.id,
              label: inLocale(row.labelEn, row.labelAr),
            })),
          ]}
          onChange={(sexId) => set("sexId", sexId)}
          errors={tried && !child.sexId ? [m.applyErrSex()] : undefined}
          className="w-48"
        />
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <SelectField
          id="child-document"
          label={m.applyDocument()}
          optional
          value={child.documentSystemId}
          options={[
            { value: "", label: m.applyDocumentNone() },
            ...options.documents.map((row) => ({
              value: row.id,
              label: inLocale(row.labelEn, row.labelAr),
            })),
          ]}
          onChange={(documentSystemId) =>
            set("documentSystemId", documentSystemId)
          }
          className="w-64"
        />
        {child.documentSystemId ? (
          <>
            <TextField
              id="child-document-number"
              label={m.applyDocumentNumber()}
              hint={
                documentShown
                  ? m.applyDocumentKept({ shown: documentShown })
                  : undefined
              }
              dir="ltr"
              width="reference"
              autoComplete="off"
              value={child.documentNumber}
              onChange={(event) => set("documentNumber", event.target.value)}
            />
            <TextField
              id="child-document-country"
              label={m.applyDocumentCountry()}
              optional
              dir="ltr"
              width="code"
              maxLength={2}
              value={child.documentCountry}
              onChange={(event) =>
                set("documentCountry", event.target.value.toUpperCase())
              }
            />
          </>
        ) : null}
      </div>
    </>
  );
}

const childInput = (child: ChildDraft) => ({
  names: child.names as PersonNamesInput,
  birthDate: child.birthDate,
  sexId: child.sexId,
  document: child.documentSystemId
    ? {
        systemId: child.documentSystemId,
        number: child.documentNumber.trim(),
        issuingCountry: child.documentCountry.trim(),
      }
    : null,
});

const childReady = (child: ChildDraft) =>
  hasName(child.names) && Boolean(child.birthDate) && Boolean(child.sexId);

export interface StartApplicationProps {
  intakeId?: string;
  onStarted: (id: string) => void;
}

interface ApplyingForProps {
  intakeId?: string;
  self: boolean;
  chosen: "self" | "other";
  onChange: (chosen: "self" | "other") => void;
}

/**
 * Whom the application is for, where the school takes applications both
 * ways: choosing the other way than the session applies continues in the
 * context that way works in, so each person's applications stay in one
 * list and those for others in the other.
 */
function ApplyingFor({ intakeId, self, chosen, onChange }: ApplyingForProps) {
  const current = self ? "self" : "other";
  const turn = useMutation({
    mutationFn: () => applyAs({ data: { applyingFor: chosen } }),
    onSuccess: () => {
      window.location.assign(intakeId ? `/apply?intake=${intakeId}` : "/apply");
    },
  });
  return (
    <div className="grid min-w-0 gap-6">
      <ChoiceField
        label={m.registerWho()}
        value={chosen}
        options={[
          { value: "self", label: m.registerWhoSelf() },
          { value: "other", label: m.registerWhoOther() },
        ]}
        onChange={onChange}
      />
      {chosen === current ? null : (
        <div className="grid justify-items-start gap-3">
          <p className="text-sm text-muted-foreground">
            {chosen === "self" ? m.applyForSelfHint() : m.applyForOtherHint()}
          </p>
          {turn.error ? (
            <p role="alert" className="text-sm text-destructive">
              {getMessageFromError(turn.error)}
            </p>
          ) : null}
          <Button
            type="button"
            disabled={turn.isPending}
            onClick={() => turn.mutate()}
          >
            {m.applyForContinue()}
            <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Starts an application: whom it is for, where the school takes them both
 * ways, the intake, then, for someone applying for others, a child the
 * family applied for before or a new one. The child is saved as a person
 * from here, so nothing about them is typed twice. Someone applying for
 * themself only picks the intake.
 */
export function StartApplication({
  intakeId,
  onStarted,
}: StartApplicationProps) {
  const queryClient = useQueryClient();
  const mine = useSuspenseQuery(myApplicationsQuery).data;
  const words = useApplyingWords(mine.self);
  const [applyingFor, setApplyingFor] = useState<"self" | "other">(
    mine.self ? "self" : "other",
  );
  const [chosenIntake, setChosenIntake] = useState(
    intakeId && mine.intakes.some((row) => row.id === intakeId)
      ? intakeId
      : (mine.intakes[0]?.id ?? ""),
  );
  const [applicant, setApplicant] = useState("");
  const [child, setChild] = useState<ChildDraft>({
    names: noNames(),
    birthDate: "",
    sexId: "",
    documentSystemId: "",
    documentNumber: "",
    documentCountry: "",
  });
  const [tried, setTried] = useState(false);
  const start = useMutation({
    mutationFn: () =>
      startApplication({
        data: mine.self
          ? {
              intakeId: chosenIntake,
              self: true,
              child: null,
              locale: getLocale() === "ar" ? "ar" : "en",
            }
          : {
              intakeId: chosenIntake,
              applicantId: applicant,
              child: applicant ? null : childInput(child),
              locale: getLocale() === "ar" ? "ar" : "en",
            },
      }),
  });
  if (mine.intakes.length === 0)
    return (
      <EmptyState icon={CalendarX} title={words(m.applyNoIntakesCore)()} />
    );
  const intake = mine.intakes.find((row) => row.id === chosenIntake);
  return (
    <div className="grid gap-8">
      {mine.eitherWay ? (
        <ApplyingFor
          intakeId={chosenIntake}
          self={mine.self}
          chosen={applyingFor}
          onChange={setApplyingFor}
        />
      ) : null}
      {(applyingFor === "self") !== mine.self ? null : (
        <form
          noValidate
          className="grid gap-8"
          onSubmit={(event) => {
            event.preventDefault();
            setTried(true);
            if (
              !chosenIntake ||
              (!mine.self && !applicant && !childReady(child))
            )
              return;
            void start.mutateAsync().then(
              async (created) => {
                await queryClient.invalidateQueries({ queryKey: ["applying"] });
                onStarted(created.id);
              },
              () => undefined,
            );
          }}
        >
          <FormSection
            title={words(m.applyIntakeTitleCore)()}
            description={words(m.applyIntakeHintCore)()}
          >
            <SelectField
              id="apply-intake"
              label={m.applyIntake()}
              value={chosenIntake}
              options={mine.intakes.map((row) => ({
                value: row.id,
                label: inLocale(row.titleEn, row.titleAr),
              }))}
              onChange={setChosenIntake}
              width="name"
            />
            {intake ? <IntakeFacts intake={intake} /> : null}
          </FormSection>
          {mine.self ? null : (
            <FormSection title={m.applyWhoTitle()}>
              {mine.children.length ? (
                <SelectField
                  id="apply-child"
                  label={m.applyWho()}
                  value={applicant}
                  options={[
                    { value: "", label: m.applyNewChild() },
                    ...mine.children.map((row) => ({
                      value: row.id,
                      label: inLocale(row.nameEn, row.nameAr),
                    })),
                  ]}
                  onChange={setApplicant}
                  width="name"
                />
              ) : null}
              {applicant ? null : (
                <ChildFields
                  child={child}
                  options={mine.options}
                  onChange={setChild}
                  tried={tried}
                />
              )}
            </FormSection>
          )}
          {start.error ? (
            <p role="alert" className="text-sm text-destructive">
              {getMessageFromError(start.error, words)}
            </p>
          ) : null}
          <Button
            type="submit"
            className="justify-self-start"
            disabled={start.isPending}
          >
            {m.applyStart()}
            <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
          </Button>
        </form>
      )}
    </div>
  );
}

interface IntakeFactsProps {
  intake: Mine["intakes"][number];
}

function IntakeFacts({ intake }: IntakeFactsProps) {
  const words = useWords();
  return (
    <dl className="grid gap-x-6 gap-y-2 rounded-lg border bg-muted/30 px-4 py-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-[13px] text-muted-foreground">{m.applyCloses()}</dt>
        <dd>{formatDate(intake.closesOn)}</dd>
      </div>
      <div>
        <dt className="text-[13px] text-muted-foreground">{m.applyAgeOn()}</dt>
        <dd>{formatDate(intake.ageCutoffOn)}</dd>
      </div>
      {intake.fees.map((fee) => (
        <div key={fee.kind}>
          <dt className="text-[13px] text-muted-foreground">
            {words(FEE_KIND_LABEL[fee.kind])()}
          </dt>
          <dd>
            <bdi>{formatAmount(fee.amount, intake.currency)}</bdi>
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface QuestionProps {
  question: FormQuestion;
  response: LessonResponse | undefined;
  onChange: (response: LessonResponse | undefined) => void;
  error?: string | null;
}

/** One of the school's own questions, as the input its kind takes. */
function Question({ question, response, onChange, error }: QuestionProps) {
  const id = `question-${question.id}`;
  const errors = error ? [error] : undefined;
  const optional = !question.required;
  const [hint] = question.hints;
  const value = formValue(question, response);
  const change = (next: string | readonly string[]) =>
    onChange(formResponse(question, next));
  if (question.type === "choice") {
    const options = question.options.map((option) => ({
      value: option.id,
      label: option.text || option.picture?.alt || "",
    }));
    if (question.multiple)
      return (
        <CheckboxGroupField
          label={question.prompt}
          hint={hint}
          value={value}
          options={options}
          errors={errors}
          onChange={change}
        />
      );
    return (
      <SelectField
        id={id}
        label={question.prompt}
        hint={hint}
        optional={optional}
        errors={errors}
        value={value[0] ?? ""}
        options={[{ value: "", label: m.applyChoose() }, ...options]}
        onChange={change}
        width="name"
      />
    );
  }
  if (question.type === "written")
    return (
      <FormField
        id={id}
        label={question.prompt}
        hint={hint}
        optional={optional}
        errors={errors}
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={4}
            maxLength={answerLimit(question)}
            value={value[0] ?? ""}
            onChange={(event) => change(event.target.value)}
          />
        )}
      </FormField>
    );
  const date = question.type === "text" && question.date;
  return (
    <TextField
      id={id}
      label={question.prompt}
      hint={hint}
      optional={optional}
      errors={errors}
      type={date ? "date" : "text"}
      inputMode={question.type === "number" ? "decimal" : undefined}
      width={date ? "date" : question.type === "number" ? "score" : "name"}
      maxLength={answerLimit(question)}
      value={value[0] ?? ""}
      onChange={(event) => change(event.target.value)}
    />
  );
}

type Draft = ApplicationDraft;

function blankSchool(): PreviousSchool {
  return {
    name: "",
    country: "",
    city: "",
    fromYear: null,
    toYear: null,
    grade: "",
    leaving: "",
  };
}

export interface ApplicationStepsProps {
  applicationId: string;
  /** The step open, by its name in the address; the first where none or another is named. */
  step: string | undefined;
  onStep: (step: string) => void;
  onSent: (reference: string) => void;
}

/**
 * The application itself, one step at a time, saved on the server as the
 * family moves on, so they can stop and come back after signing in again.
 */
export function ApplicationSteps({
  applicationId,
  step: asked,
  onStep,
  onSent,
}: ApplicationStepsProps) {
  const queryClient = useQueryClient();
  const data = useSuspenseQuery(draftQuery(applicationId)).data;
  const self = data.application.self;
  const words = useApplyingWords(self);
  const filled = useSlot(applicationSteps);
  const added = self ? [] : filled;
  const locale = getLocale() === "ar" ? "ar" : "en";
  const [child, setChild] = useState<ChildDraft>(() => ({
    names: { ar: text(data.child.names.ar), en: text(data.child.names.en) },
    birthDate: data.child.birthDate ?? "",
    sexId: data.child.sexId ?? "",
    documentSystemId: data.child.document?.systemId ?? "",
    documentNumber: "",
    documentCountry: data.child.document?.issuingCountry ?? "",
  }));
  const [form, setForm] = useState<ApplicationAnswers>(() => ({
    ...data.application.form,
    relationId: data.application.form.relationId,
    other: data.application.form.other
      ? {
          ...data.application.form.other,
          names: {
            ar: text(data.application.form.other.names.ar),
            en: text(data.application.form.other.names.en),
          },
        }
      : null,
  }));
  const questions = formQuestions(questionsIn(data.questions, locale));
  const answerError = (question: FormQuestion) => {
    const read = readFormAnswers([question], form.answers);
    if (read.ok) return null;
    return read.code === "required"
      ? m.validationRequired()
      : m.validationInvalid();
  };
  const [needs, setNeeds] = useState<Needs>(data.needs);
  const [needsDirty, setNeedsDirty] = useState(false);
  const [version, setVersion] = useState(data.application.version);
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [tried, setTried] = useState(false);
  const sent = data.application.state !== "draft";

  const save = useMutation({
    mutationFn: () =>
      saveDraft({
        data: {
          id: applicationId,
          expectedVersion: version,
          child: childInput(child),
          form,
          needs: needsDirty ? needs : null,
        },
      }),
  });
  const submit = useMutation({
    mutationFn: (expectedVersion: number) =>
      submitApplication({
        data: {
          id: applicationId,
          expectedVersion,
          locale,
          consents: data.consents.flatMap((consent) =>
            consent.notice
              ? [
                  {
                    noticeId: consent.notice.id,
                    agreed: agreed[consent.notice.id] === true,
                  },
                ]
              : [],
          ),
        },
      }),
  });

  const stepValid: Record<ApplyStep, boolean> = {
    child: childReady(child),
    schools: form.schools.every((school) => school.name.trim() !== ""),
    needs: true,
    questions: readFormAnswers(questions, form.answers).ok,
    documents: true,
    send: data.consents.every(
      (consent) =>
        !consent.notice ||
        (consent.meaning !== "admission_processing" &&
          !(
            consent.meaning === "special_category" &&
            NEEDS_KINDS.some((kind) => needs[kind].trim())
          )) ||
        agreed[consent.notice.id] === true,
    ),
  };
  const steps = APPLY_STEPS.filter(
    (each) => each !== "needs" || data.asksNeeds,
  ).flatMap((each): string[] => [
    each,
    ...added.filter((part) => part.after === each).map((part) => part.id),
  ]);
  const step = asked && steps.includes(asked) ? asked : "child";
  const index = steps.indexOf(step);
  const part = added.find((each) => each.id === step);
  const valid = (at: string) =>
    isApplyStep(at)
      ? stepValid[at]
      : (added.find((each) => each.id === at)?.valid(form) ?? true);
  const labelOf = (at: string) =>
    isApplyStep(at)
      ? words(STEP_LABEL[at])()
      : (added.find((each) => each.id === at)?.label() ?? "");

  const persist = async () => {
    const saved = await save.mutateAsync();
    setVersion(saved.version);
    setNeedsDirty(false);
    await queryClient.invalidateQueries({ queryKey: ["applying"] });
    return saved.version;
  };

  const go = async (to: string, check: boolean) => {
    if (check) {
      setTried(true);
      if (!valid(step)) return;
    }
    if (!sent) await persist().catch(() => undefined);
    setTried(false);
    onStep(to);
  };

  if (sent)
    return (
      <div className="grid gap-4">
        <p className="rounded-lg border px-4 py-3 text-sm">
          {m.applyAlreadySent({ reference: data.application.reference ?? "" })}
        </p>
        <DocumentsStep data={data} />
      </div>
    );

  return (
    <div className="grid gap-8">
      <nav aria-label={m.applySteps()}>
        <ol className="flex flex-wrap gap-2 text-sm">
          {steps.map((each, at) => (
            <li key={each}>
              <button
                type="button"
                aria-current={each === step ? "step" : undefined}
                onClick={() => void go(each, false)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 hover:bg-muted aria-[current=step]:border-primary aria-[current=step]:bg-primary/10 aria-[current=step]:text-primary"
              >
                <span className="tabular-nums">{String(at + 1)}</span>
                {labelOf(each)}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <section aria-labelledby="apply-step-title" className="grid gap-6">
        <h2 id="apply-step-title" className="text-xl font-semibold">
          {labelOf(step)}
        </h2>
        {step === "child" ? (
          <>
            <ChildFields
              child={child}
              options={data.options}
              onChange={setChild}
              tried={tried}
              documentShown={data.child.document?.shown ?? null}
            />
            <StatusText
              tone={data.child.age === "fits" ? "success" : "warning"}
            >
              {words(AGE_LABEL[data.child.age])()}
            </StatusText>
          </>
        ) : null}
        {part ? (
          <part.Step
            form={form}
            onChange={setForm}
            options={data.options}
            tried={tried}
          />
        ) : null}
        {step === "schools" ? (
          <SchoolsStep
            form={form}
            onChange={setForm}
            tried={tried}
            self={self}
          />
        ) : null}
        {step === "needs" ? (
          <>
            <p className="text-sm text-muted-foreground">
              {m.applyNeedsHint()}
            </p>
            {NEEDS_KINDS.map((kind) => (
              <FormField
                key={kind}
                id={`needs-${kind}`}
                label={NEEDS_LABEL[kind]()}
                hint={NEEDS_HINT[kind]()}
                optional
              >
                {(control) => (
                  <Textarea
                    {...control}
                    dir="auto"
                    rows={3}
                    maxLength={2000}
                    value={needs[kind]}
                    onChange={(event) => {
                      setNeeds({ ...needs, [kind]: event.target.value });
                      setNeedsDirty(true);
                    }}
                  />
                )}
              </FormField>
            ))}
          </>
        ) : null}
        {step === "questions" ? (
          questions.length ? (
            questions.map((question) => (
              <Question
                key={question.id}
                question={question}
                response={form.answers[question.id]}
                onChange={(response) => {
                  const { [question.id]: _left, ...others } = form.answers;
                  setForm({
                    ...form,
                    answers: response
                      ? { ...others, [question.id]: response }
                      : others,
                  });
                }}
                error={tried ? answerError(question) : null}
              />
            ))
          ) : (
            <EmptyState placement="section" title={m.applyNoQuestions()} />
          )
        ) : null}
        {step === "documents" ? <DocumentsStep data={data} /> : null}
        {step === "send" ? (
          <SendStep
            data={data}
            agreed={agreed}
            onAgree={(noticeId, value) =>
              setAgreed({ ...agreed, [noticeId]: value })
            }
            tried={tried}
          />
        ) : null}
      </section>
      {save.error || submit.error ? (
        <p role="alert" className="text-sm text-destructive">
          {getMessageFromError(submit.error ?? save.error, words)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {index > 0 ? (
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending}
            onClick={() => void go(steps[index - 1] ?? "child", false)}
          >
            <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
            {m.applyBack()}
          </Button>
        ) : null}
        {step === "send" ? (
          <Button
            type="button"
            disabled={save.isPending || submit.isPending}
            onClick={() => {
              setTried(true);
              if (!stepValid.send) return;
              void persist()
                .then((current) => submit.mutateAsync(current))
                .then(async (result) => {
                  await queryClient.invalidateQueries({
                    queryKey: ["applying"],
                  });
                  toast.success(m.applySent());
                  onSent(result.reference);
                })
                .catch(() => undefined);
            }}
          >
            <Send aria-hidden className="size-4 rtl:-scale-x-100" />
            {m.applySend()}
          </Button>
        ) : (
          <Button
            type="button"
            disabled={save.isPending}
            onClick={() => void go(steps[index + 1] ?? "send", true)}
          >
            {m.applySaveContinue()}
            <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
          </Button>
        )}
      </div>
    </div>
  );
}

const yearOf = (value: string) =>
  /^\d{4}$/.test(value.trim()) ? Number(value) : null;

interface SchoolsStepProps {
  form: ApplicationAnswers;
  onChange: (form: ApplicationAnswers) => void;
  tried: boolean;
  /** The applicant filed for themself. */
  self: boolean;
}

function SchoolsStep({ form, onChange, tried, self }: SchoolsStepProps) {
  const words = useApplyingWords(self);
  const grades = useSlot(previousSchoolGrades).length > 0;
  const setSchool = (index: number, patch: Partial<PreviousSchool>) =>
    onChange({
      ...form,
      schools: form.schools.map((school, at) =>
        at === index ? { ...school, ...patch } : school,
      ),
    });
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {words(m.applySchoolsHintCore)()}
      </p>
      <ol className="grid gap-4" aria-label={m.applyStepSchools()}>
        {form.schools.map((school, index) => (
          <li key={String(index)} className="grid gap-3 rounded-lg border p-4">
            <TextField
              id={`school-${String(index)}-name`}
              label={m.applySchoolName()}
              width="name"
              value={school.name}
              onChange={(event) =>
                setSchool(index, { name: event.target.value })
              }
              errors={
                tried && !school.name.trim()
                  ? [m.validationRequired()]
                  : undefined
              }
            />
            <div className="flex flex-wrap gap-4">
              <TextField
                id={`school-${String(index)}-city`}
                label={m.applySchoolCity()}
                optional
                value={school.city}
                onChange={(event) =>
                  setSchool(index, { city: event.target.value })
                }
              />
              <TextField
                id={`school-${String(index)}-country`}
                label={m.applyDocumentCountry()}
                optional
                dir="ltr"
                width="code"
                maxLength={2}
                value={school.country ?? ""}
                onChange={(event) =>
                  setSchool(index, {
                    country: event.target.value.toUpperCase(),
                  })
                }
              />
              {grades ? (
                <TextField
                  id={`school-${String(index)}-grade`}
                  label={m.applySchoolGrade()}
                  optional
                  value={school.grade}
                  onChange={(event) =>
                    setSchool(index, { grade: event.target.value })
                  }
                />
              ) : null}
            </div>
            <div className="flex flex-wrap gap-4">
              <TextField
                id={`school-${String(index)}-from`}
                label={m.applySchoolFrom()}
                optional
                inputMode="numeric"
                dir="ltr"
                width="score"
                value={school.fromYear === null ? "" : String(school.fromYear)}
                onChange={(event) =>
                  setSchool(index, { fromYear: yearOf(event.target.value) })
                }
              />
              <TextField
                id={`school-${String(index)}-to`}
                label={m.applySchoolTo()}
                optional
                inputMode="numeric"
                dir="ltr"
                width="score"
                value={school.toYear === null ? "" : String(school.toYear)}
                onChange={(event) =>
                  setSchool(index, { toYear: yearOf(event.target.value) })
                }
              />
            </div>
            <FormField
              id={`school-${String(index)}-leaving`}
              label={words(m.applySchoolLeavingCore)()}
              optional
            >
              {(control) => (
                <Textarea
                  {...control}
                  dir="auto"
                  rows={2}
                  maxLength={500}
                  value={school.leaving}
                  onChange={(event) =>
                    setSchool(index, { leaving: event.target.value })
                  }
                />
              )}
            </FormField>
            <Button
              type="button"
              variant="ghost"
              className="justify-self-start"
              onClick={() =>
                onChange({
                  ...form,
                  schools: form.schools.filter((_, at) => at !== index),
                })
              }
            >
              <Trash2 aria-hidden className="size-4" />
              {m.applySchoolRemove()}
            </Button>
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        disabled={form.schools.length >= MAX_PREVIOUS_SCHOOLS}
        onClick={() =>
          onChange({ ...form, schools: [...form.schools, blankSchool()] })
        }
      >
        <Plus aria-hidden className="size-4" />
        {m.applySchoolAdd()}
      </Button>
    </>
  );
}

export interface DocumentsStepProps {
  data: Draft;
}

/** The checklist's documents, each uploaded through the files system and filed under its step. */
export function DocumentsStep({ data }: DocumentsStepProps) {
  const queryClient = useQueryClient();
  const documents = data.items.filter((item) => item.kind === "document");
  const others = data.items.filter((item) => item.kind !== "document");
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["applying"] });
  if (data.items.length === 0)
    return <EmptyState placement="section" title={m.applyNoDocuments()} />;
  return (
    <div className="grid gap-6">
      {documents.map((item) => (
        <div key={item.id} className="grid gap-2">
          <FileField
            id={`document-${item.id}`}
            label={named(item.labelEn, item.labelAr)}
            hint={m.applyDocumentHint()}
            optional={!item.required}
            purpose="admission_document"
            maxFiles={MAX_FILES_PER_ITEM}
            maxBytes={MAX_DOCUMENT_BYTES}
            disabled={item.state === "verified" || item.state === "waived"}
            value={item.files as FileSummary[]}
            onChange={(update) => {
              const next = update(item.files);
              const added = next.filter(
                (file) => !item.files.some((each) => each.id === file.id),
              );
              const removed = item.files.filter(
                (file) => !next.some((each) => each.id === file.id),
              );
              void Promise.all([
                ...added.map((file) =>
                  attachDocument({
                    data: {
                      applicationId: data.application.id,
                      itemId: item.id,
                      fileId: file.id,
                    },
                  }),
                ),
                ...removed.map((file) =>
                  detachDocument({
                    data: {
                      applicationId: data.application.id,
                      fileId: file.id,
                    },
                  }),
                ),
              ]).then(refresh, (error: unknown) =>
                toast.error(getMessageFromError(error)),
              );
            }}
          />
          <StatusText tone={ITEM_STATE_TONE[item.state]}>
            {ITEM_STATE_LABEL[item.state]()}
          </StatusText>
        </div>
      ))}
      {others.length ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">{m.applyLaterSteps()}</h3>
          <ul className="grid gap-1 text-sm">
            {others.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2">
                <span dir="auto">{named(item.labelEn, item.labelAr)}</span>
                <StatusText tone={ITEM_STATE_TONE[item.state]}>
                  {ITEM_STATE_LABEL[item.state]()}
                </StatusText>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

interface SendStepProps {
  data: Draft;
  agreed: Record<string, boolean>;
  onAgree: (noticeId: string, value: boolean) => void;
  tried: boolean;
}

function SendStep({ data, agreed, onAgree, tried }: SendStepProps) {
  const [locale, setLocale] = useState<ContentLocale>(
    getLocale() === "ar" ? "ar" : "en",
  );
  const asked = data.consents.filter((consent) => consent.notice);
  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">{m.applySendHint()}</p>
      {asked.map((consent) => {
        const notice = consent.notice;
        if (!notice) return null;
        const required = consent.meaning !== "marketing";
        return (
          <div key={notice.id} className="grid gap-3 rounded-lg border p-4">
            <h3 className="text-base font-semibold">
              {inLocale(consent.labelEn, consent.labelAr)}
            </h3>
            {notice.body ? (
              <div className="rounded-md bg-muted/30 px-4 py-3">
                <TranslatedView
                  body={notice.body}
                  translation={notice.translation}
                  primary={notice.primaryLocale}
                  locale={locale}
                  onLocaleChange={setLocale}
                />
              </div>
            ) : null}
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={agreed[notice.id] === true}
                onCheckedChange={(value) => onAgree(notice.id, value)}
              />
              <span>
                {m.applyAgree()}
                {required ? null : (
                  <span className="ms-1.5 text-muted-foreground">
                    {m.formOptionalSuffix()}
                  </span>
                )}
              </span>
            </label>
            {tried &&
            required &&
            consent.meaning === "admission_processing" &&
            agreed[notice.id] !== true ? (
              <p className="text-[13px] text-destructive">
                {m.applyErrConsent()}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
