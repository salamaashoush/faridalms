import type {
  AdmissionQuestion,
  applicationFormSchema,
  Needs,
  PreviousSchool,
} from "@faridalms/domain/admissions";
import type { FileSummary } from "@faridalms/domain/file";
import type { PersonNamesInput } from "@faridalms/domain/people";
import type { ContentLocale } from "@faridalms/domain/translations";
import type * as v from "valibot";

import {
  MAX_FILES_PER_ITEM,
  MAX_PREVIOUS_SCHOOLS,
  NEEDS_KINDS,
  questionIn,
} from "@faridalms/domain/admissions";
import { answerLimit, optionsOf } from "@faridalms/domain/enquiries";
import { Button } from "@faridalms/ui/button";
import { Checkbox } from "@faridalms/ui/checkbox";
import { Textarea } from "@faridalms/ui/textarea";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Plus, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { TranslatedView } from "~/components/content/TranslatedView";
import { FormField, SelectField, TextField } from "~/components/system/field";
import { FileField } from "~/components/system/FileField";
import { FormSection } from "~/components/system/RecordForm";
import { StatusText } from "~/components/system/status";
import { inLocale } from "~/hooks/useCurrentUser";
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
import { formatAmount, formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import {
  AGE_LABEL,
  FEE_KIND_LABEL,
  ITEM_STATE_LABEL,
  ITEM_STATE_TONE,
  NEEDS_HINT,
  NEEDS_LABEL,
  named,
} from "./application-labels";

export const APPLY_STEPS = [
  "child",
  "family",
  "schools",
  "needs",
  "questions",
  "documents",
  "send",
] as const;
export type ApplyStep = (typeof APPLY_STEPS)[number];

const STEP_LABEL: Record<ApplyStep, () => string> = {
  child: m.applyStepChild,
  family: m.applyStepFamily,
  schools: m.applyStepSchools,
  needs: m.applyStepNeeds,
  questions: m.applyStepQuestions,
  documents: m.applyStepDocuments,
  send: m.applyStepSend,
};

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

interface Parts {
  given: string;
  middle: string;
  family: string;
}
interface Names {
  ar: Parts;
  en: Parts;
}
/** The form as the family edits it, every name part a string. */
type FormAnswers = Omit<v.InferInput<typeof applicationFormSchema>, "other"> & {
  other:
    | (Omit<
        NonNullable<v.InferInput<typeof applicationFormSchema>["other"]>,
        "names"
      > & { names: Names })
    | null;
};
const text = (parts: {
  given: string | null;
  middle: string | null;
  family: string | null;
}) => ({
  given: parts.given ?? "",
  middle: parts.middle ?? "",
  family: parts.family ?? "",
});
const noNames = (): Names => ({
  ar: { given: "", middle: "", family: "" },
  en: { given: "", middle: "", family: "" },
});
const hasName = (names: Names) =>
  [names.ar, names.en].some(
    (parts) => parts.given.trim() && parts.family.trim(),
  );

function NamesFields({
  id,
  names,
  onChange,
  error,
}: {
  id: string;
  names: Names;
  onChange: (names: Names) => void;
  error?: string | null;
}) {
  const set = (script: "ar" | "en", part: keyof Names["en"], value: string) =>
    onChange({ ...names, [script]: { ...names[script], [part]: value } });
  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">{m.applyNameAr()}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            id={`${id}-ar-given`}
            label={m.applyGivenAr()}
            dir="rtl"
            value={names.ar.given}
            onChange={(event) => set("ar", "given", event.target.value)}
            errors={error ? [error] : undefined}
          />
          <TextField
            id={`${id}-ar-middle`}
            label={m.applyMiddleAr()}
            optional
            dir="rtl"
            value={names.ar.middle}
            onChange={(event) => set("ar", "middle", event.target.value)}
          />
          <TextField
            id={`${id}-ar-family`}
            label={m.applyFamilyName()}
            dir="rtl"
            value={names.ar.family}
            onChange={(event) => set("ar", "family", event.target.value)}
          />
        </div>
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">{m.applyNameEn()}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <TextField
            id={`${id}-en-given`}
            label={m.applyGivenEn()}
            dir="ltr"
            value={names.en.given}
            onChange={(event) => set("en", "given", event.target.value)}
          />
          <TextField
            id={`${id}-en-middle`}
            label={m.applyMiddleEn()}
            optional
            dir="ltr"
            value={names.en.middle}
            onChange={(event) => set("en", "middle", event.target.value)}
          />
          <TextField
            id={`${id}-en-family`}
            label={m.applyFamilyName()}
            dir="ltr"
            value={names.en.family}
            onChange={(event) => set("en", "family", event.target.value)}
          />
        </div>
      </fieldset>
    </div>
  );
}

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

function ChildFields({
  child,
  options,
  onChange,
  tried,
  documentShown,
}: {
  child: ChildDraft;
  options: Mine["options"];
  onChange: (child: ChildDraft) => void;
  tried: boolean;
  documentShown?: string | null;
}) {
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

/**
 * Starts an application: the intake, then a child the family applied for
 * before or a new one. The child is saved as a person from here, so nothing
 * about them is typed twice.
 */
export function StartApplication({
  intakeId,
  onStarted,
}: {
  intakeId?: string;
  onStarted: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const mine = useSuspenseQuery(myApplicationsQuery).data;
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
        data: {
          intakeId: chosenIntake,
          applicantId: applicant,
          child: applicant ? null : childInput(child),
          locale: getLocale() === "ar" ? "ar" : "en",
        },
      }),
  });
  if (mine.intakes.length === 0)
    return (
      <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
        {m.applyNoIntakes()}
      </p>
    );
  const intake = mine.intakes.find((row) => row.id === chosenIntake);
  return (
    <form
      noValidate
      className="grid gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if (!chosenIntake || (!applicant && !childReady(child))) return;
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
        title={m.applyIntakeTitle()}
        description={m.applyIntakeHint()}
      >
        <SelectField
          id="apply-intake"
          label={m.applyIntake()}
          value={chosenIntake}
          options={mine.intakes.map((row) => ({
            value: row.id,
            label: m.itkEditTitle({
              grade: inLocale(row.gradeEn, row.gradeAr),
              year: inLocale(row.yearTitleEn, row.yearTitleAr),
            }),
          }))}
          onChange={setChosenIntake}
          width="name"
        />
        {intake ? <IntakeFacts intake={intake} /> : null}
      </FormSection>
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
      {start.error ? (
        <p role="alert" className="text-sm text-destructive">
          {getMessageFromError(start.error)}
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
  );
}

function IntakeFacts({ intake }: { intake: Mine["intakes"][number] }) {
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
            {FEE_KIND_LABEL[fee.kind]()}
          </dt>
          <dd>
            <bdi>{formatAmount(fee.amount, intake.currency)}</bdi>
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Question({
  question,
  value,
  onChange,
  error,
}: {
  question: AdmissionQuestion;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
}) {
  const shown = questionIn(question, getLocale() === "ar" ? "ar" : "en");
  const id = `question-${question.id}`;
  const errors = error ? [error] : undefined;
  const optional = question.required === "optional";
  switch (question.answer) {
    case "long":
      return (
        <FormField
          id={id}
          label={shown.label}
          hint={shown.hint || undefined}
          optional={optional}
          errors={errors}
        >
          {(control) => (
            <Textarea
              {...control}
              dir="auto"
              rows={4}
              maxLength={answerLimit("long")}
              value={value}
              onChange={(event) => onChange(event.target.value)}
            />
          )}
        </FormField>
      );
    case "choice":
      return (
        <SelectField
          id={id}
          label={shown.label}
          hint={shown.hint || undefined}
          optional={optional}
          errors={errors}
          value={value}
          options={[
            { value: "", label: m.applyChoose() },
            ...optionsOf(shown.options).map((option) => ({
              value: option,
              label: option,
            })),
          ]}
          onChange={onChange}
          width="name"
        />
      );
    default:
      return (
        <TextField
          id={id}
          label={shown.label}
          hint={shown.hint || undefined}
          optional={optional}
          errors={errors}
          type={question.answer === "date" ? "date" : "text"}
          inputMode={question.answer === "number" ? "decimal" : undefined}
          width={
            question.answer === "date"
              ? "date"
              : question.answer === "number"
                ? "score"
                : "name"
          }
          maxLength={answerLimit(question.answer)}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      );
  }
}

type Draft = Awaited<
  ReturnType<NonNullable<ReturnType<typeof draftQuery>["queryFn"]>>
>;

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

/**
 * The application itself, one step at a time, saved on the server as the
 * family moves on, so they can stop and come back after signing in again.
 */
export function ApplicationSteps({
  applicationId,
  step,
  onStep,
  onSent,
}: {
  applicationId: string;
  step: ApplyStep;
  onStep: (step: ApplyStep) => void;
  onSent: (reference: string) => void;
}) {
  const queryClient = useQueryClient();
  const data = useSuspenseQuery(draftQuery(applicationId)).data;
  const locale = getLocale() === "ar" ? "ar" : "en";
  const [child, setChild] = useState<ChildDraft>(() => ({
    names: { ar: text(data.child.names.ar), en: text(data.child.names.en) },
    birthDate: data.child.birthDate ?? "",
    sexId: data.child.sexId ?? "",
    documentSystemId: data.child.document?.systemId ?? "",
    documentNumber: "",
    documentCountry: data.child.document?.issuingCountry ?? "",
  }));
  const [form, setForm] = useState<FormAnswers>(() => ({
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
    family:
      Boolean(form.relationId) &&
      form.responsible &&
      (!form.other ||
        (hasName(form.other.names) && Boolean(form.other.relationId))),
    schools: form.schools.every((school) => school.name.trim() !== ""),
    needs: true,
    questions: data.questions.every((question) => {
      const value = (form.questions[question.id] ?? "").trim();
      return question.required === "optional" || value !== "";
    }),
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
  const index = APPLY_STEPS.indexOf(step);

  const persist = async () => {
    const saved = await save.mutateAsync();
    setVersion(saved.version);
    setNeedsDirty(false);
    await queryClient.invalidateQueries({ queryKey: ["applying"] });
    return saved.version;
  };

  const go = async (to: ApplyStep, check: boolean) => {
    if (check) {
      setTried(true);
      if (!stepValid[step]) return;
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
          {APPLY_STEPS.map((each, at) => (
            <li key={each}>
              <button
                type="button"
                aria-current={each === step ? "step" : undefined}
                onClick={() => void go(each, false)}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 hover:bg-muted aria-[current=step]:border-primary aria-[current=step]:bg-primary/10 aria-[current=step]:text-primary"
              >
                <span className="tabular-nums">{String(at + 1)}</span>
                {STEP_LABEL[each]()}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <section aria-labelledby="apply-step-title" className="grid gap-6">
        <h2 id="apply-step-title" className="text-xl font-semibold">
          {STEP_LABEL[step]()}
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
              {AGE_LABEL[data.child.age]()}
            </StatusText>
          </>
        ) : null}
        {step === "family" ? (
          <FamilyStep
            form={form}
            onChange={setForm}
            options={data.options}
            tried={tried}
          />
        ) : null}
        {step === "schools" ? (
          <SchoolsStep form={form} onChange={setForm} tried={tried} />
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
          data.questions.length ? (
            data.questions.map((question) => (
              <Question
                key={question.id}
                question={question}
                value={form.questions[question.id] ?? ""}
                onChange={(value) =>
                  setForm({
                    ...form,
                    questions: { ...form.questions, [question.id]: value },
                  })
                }
                error={
                  tried &&
                  question.required === "required" &&
                  !(form.questions[question.id] ?? "").trim()
                    ? m.validationRequired()
                    : null
                }
              />
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              {m.applyNoQuestions()}
            </p>
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
          {getMessageFromError(submit.error ?? save.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        {index > 0 ? (
          <Button
            type="button"
            variant="outline"
            disabled={save.isPending}
            onClick={() => void go(APPLY_STEPS[index - 1] ?? "child", false)}
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
            onClick={() => void go(APPLY_STEPS[index + 1] ?? "send", true)}
          >
            {m.applySaveContinue()}
            <ArrowRight aria-hidden className="size-4 rtl:rotate-180" />
          </Button>
        )}
      </div>
    </div>
  );
}

function FamilyStep({
  form,
  onChange,
  options,
  tried,
}: {
  form: FormAnswers;
  onChange: (form: FormAnswers) => void;
  options: Draft["options"];
  tried: boolean;
}) {
  const relations = [
    { value: "", label: m.applyChoose() },
    ...options.relations.map((row) => ({
      value: row.id,
      label: inLocale(row.labelEn, row.labelAr),
    })),
  ];
  const other = form.other;
  return (
    <>
      <SelectField
        id="family-relation"
        label={m.applyYourRelation()}
        value={form.relationId ?? ""}
        options={relations}
        onChange={(relationId) => onChange({ ...form, relationId })}
        errors={tried && !form.relationId ? [m.applyErrRelation()] : undefined}
        width="name"
      />
      <TextField
        id="family-phone"
        label={m.applyYourPhone()}
        optional
        type="tel"
        dir="ltr"
        width="phone"
        value={form.phone ?? ""}
        onChange={(event) => onChange({ ...form, phone: event.target.value })}
      />
      <fieldset
        className="grid gap-2"
        aria-describedby="family-responsible-hint"
        data-invalid={tried && !form.responsible ? true : undefined}
      >
        <legend className="text-sm leading-5 font-medium">
          {m.applyResponsible()}
        </legend>
        <p
          id="family-responsible-hint"
          className="text-[13px] leading-[18px] text-muted-foreground"
        >
          {m.applyResponsibleHint()}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={form.responsible}
            onCheckedChange={(responsible) =>
              onChange({ ...form, responsible })
            }
          />
          {m.applyResponsibleYes()}
        </label>
        {tried && !form.responsible ? (
          <p className="text-[13px] leading-[18px] text-destructive">
            {m.applyErrResponsible()}
          </p>
        ) : null}
      </fieldset>
      <FormSection title={m.applyOtherTitle()} description={m.applyOtherHint()}>
        {other ? (
          <>
            <SelectField
              id="other-relation"
              label={m.aplFieldRelation()}
              value={other.relationId}
              options={relations}
              onChange={(relationId) =>
                onChange({ ...form, other: { ...other, relationId } })
              }
              errors={
                tried && !other.relationId ? [m.applyErrRelation()] : undefined
              }
              width="name"
            />
            <NamesFields
              id="other"
              names={other.names}
              onChange={(names) =>
                onChange({ ...form, other: { ...other, names } })
              }
              error={tried && !hasName(other.names) ? m.applyErrName() : null}
            />
            <div className="flex flex-wrap gap-4">
              <TextField
                id="other-email"
                label={m.admFieldEmail()}
                optional
                type="email"
                dir="ltr"
                width="name"
                value={other.email ?? ""}
                onChange={(event) =>
                  onChange({
                    ...form,
                    other: { ...other, email: event.target.value },
                  })
                }
              />
              <TextField
                id="other-phone"
                label={m.admFieldPhone()}
                optional
                type="tel"
                dir="ltr"
                width="phone"
                value={other.phone ?? ""}
                onChange={(event) =>
                  onChange({
                    ...form,
                    other: { ...other, phone: event.target.value },
                  })
                }
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={other.livesWithChild}
                onCheckedChange={(livesWithChild) =>
                  onChange({ ...form, other: { ...other, livesWithChild } })
                }
              />
              {m.applyLivesWith()}
            </label>
            <Button
              type="button"
              variant="ghost"
              className="justify-self-start"
              onClick={() => onChange({ ...form, other: null })}
            >
              <Trash2 aria-hidden className="size-4" />
              {m.applyOtherRemove()}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="justify-self-start"
            onClick={() =>
              onChange({
                ...form,
                other: {
                  relationId: "",
                  names: noNames(),
                  email: "",
                  phone: "",
                  livesWithChild: true,
                },
              })
            }
          >
            <Plus aria-hidden className="size-4" />
            {m.applyOtherAdd()}
          </Button>
        )}
      </FormSection>
    </>
  );
}

const yearOf = (value: string) =>
  /^\d{4}$/.test(value.trim()) ? Number(value) : null;

function SchoolsStep({
  form,
  onChange,
  tried,
}: {
  form: FormAnswers;
  onChange: (form: FormAnswers) => void;
  tried: boolean;
}) {
  const setSchool = (index: number, patch: Partial<PreviousSchool>) =>
    onChange({
      ...form,
      schools: form.schools.map((school, at) =>
        at === index ? { ...school, ...patch } : school,
      ),
    });
  return (
    <>
      <p className="text-sm text-muted-foreground">{m.applySchoolsHint()}</p>
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
              <TextField
                id={`school-${String(index)}-grade`}
                label={m.applySchoolGrade()}
                optional
                value={school.grade}
                onChange={(event) =>
                  setSchool(index, { grade: event.target.value })
                }
              />
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
              label={m.applySchoolLeaving()}
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

/** The checklist's documents, each uploaded through the files system and filed under its step. */
export function DocumentsStep({ data }: { data: Draft }) {
  const queryClient = useQueryClient();
  const documents = data.items.filter((item) => item.kind === "document");
  const others = data.items.filter((item) => item.kind !== "document");
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["applying"] });
  if (data.items.length === 0)
    return (
      <p className="text-sm text-muted-foreground">{m.applyNoDocuments()}</p>
    );
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

function SendStep({
  data,
  agreed,
  onAgree,
  tried,
}: {
  data: Draft;
  agreed: Record<string, boolean>;
  onAgree: (noticeId: string, value: boolean) => void;
  tried: boolean;
}) {
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
