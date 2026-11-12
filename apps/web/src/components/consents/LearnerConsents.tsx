import type { ContentLocale } from "@faridalms/domain/translations";

import { Button } from "@faridalms/ui/button";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { RecordList, RecordSection } from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Printer, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { shownIn, TranslatedView } from "~/components/content/TranslatedView";
import { displayName } from "~/components/people/format";
import { usePrint } from "~/components/print/usePrint";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { myConsentsQuery } from "~/queries/consents";
import { answerConsent } from "~/server/consents";
import { formatInstant, formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { useWords } from "~/utils/words";

import { DECISION_LABEL, DECISION_TONE } from "./format";

type Data = Awaited<
  ReturnType<NonNullable<(typeof myConsentsQuery)["queryFn"]>>
>;
type Form = Data["forms"][number];
type Learner = Data["learners"][number];
type Answer = Learner["answers"][number];

const answerTo = (learner: Learner, form: Form): Answer | null =>
  learner.answers.find((row) => row.purposeId === form.purposeId) ?? null;

/**
 * An answer still owed: none yet, one the law asks again for, or
 * one given to an earlier version of the form, which stays in force until
 * this one is answered.
 */
const waiting = (answer: Answer | null, form: Form) =>
  !answer || answer.due || answer.formId !== form.id;

interface LearnerAnswerProps {
  learner: Learner;
  form: Form;
}

function LearnerAnswer({ learner, form }: LearnerAnswerProps) {
  const queryClient = useQueryClient();
  const words = useWords();
  const answer = answerTo(learner, form);
  const [changing, setChanging] = useState(false);
  const mutation = useMutation({
    mutationFn: (agreed: boolean) =>
      answerConsent({
        data: { studentId: learner.studentId, noticeId: form.id, agreed },
      }),
    onSuccess: async () => {
      setChanging(false);
      await queryClient.invalidateQueries({ queryKey: ["consents"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success(m.consentSaved());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const owed = waiting(answer, form);
  const asking = learner.mayAnswer && (owed || changing);
  const name = displayName(learner);
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="grid min-w-0 flex-1 gap-0.5">
        <span dir="auto" className="text-sm leading-5 font-medium">
          {name}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 text-[13px] leading-[18px]">
          <StatusText
            tone={answer ? DECISION_TONE[answer.decision] : "neutral"}
          >
            {answer
              ? DECISION_LABEL[answer.decision]()
              : m.consentNotAnswered()}
          </StatusText>
          {answer ? (
            <span className="text-muted-foreground">
              {answer.givenByMe
                ? m.consentByYouOn({ date: formatDate(answer.givenOn) })
                : m.consentByOn({
                    name: inLocale(answer.givenByEn, answer.givenByAr),
                    date: formatDate(answer.givenOn),
                  })}
            </span>
          ) : null}
          {answer && owed ? (
            <StatusText tone="warning">{m.consentAskedAgain()}</StatusText>
          ) : null}
        </span>
        {learner.mayAnswer ? null : (
          <span className="text-[13px] leading-[18px] text-muted-foreground">
            {learner.self
              ? words(m.consentAnsweredForYouCore)()
              : m.consentGuardianAnswers()}
          </span>
        )}
      </div>
      {asking ? (
        <fieldset className="flex gap-2">
          <legend className="sr-only">{m.consentAnswerFor({ name })}</legend>
          <Button
            type="button"
            className="max-md:h-10"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(true)}
          >
            {m.consentAgree()}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(false)}
          >
            {m.consentDisagree()}
          </Button>
        </fieldset>
      ) : learner.mayAnswer ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-md:h-10"
          aria-label={m.consentChangeFor({ name })}
          onClick={() => setChanging(true)}
        >
          {m.consentChange()}
        </Button>
      ) : null}
    </li>
  );
}

interface FormCardProps {
  form: Form;
  learners: Learner[];
}

function FormCard({ form, learners }: FormCardProps) {
  const open = learners.some(
    (learner) => learner.mayAnswer && waiting(answerTo(learner, form), form),
  );
  const [locale, setLocale] = useState<ContentLocale>(() =>
    getLocale() === "ar" ? "ar" : "en",
  );
  const title = inLocale(form.labelEn, form.labelAr);
  // A form may be printed to read it through, or to sign and hand in.
  const printing = usePrint(
    form.body
      ? {
          title,
          content: shownIn({
            body: form.body,
            translation: form.translation,
            primary: form.primaryLocale,
            locale,
          }),
          slip: learners
            .filter((learner) => learner.mayAnswer)
            .map((learner) => displayName(learner)),
        }
      : null,
  );
  return (
    <RecordSection
      title={title}
      action={
        printing.action ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="max-md:h-10"
            onClick={() => void printing.action?.onSelect()}
          >
            <Printer aria-hidden />
            {m.printTitle()}
          </Button>
        ) : undefined
      }
      description={
        form.publishedAt
          ? m.consentFormFrom({
              date: formatInstant(form.publishedAt, "date"),
            })
          : undefined
      }
    >
      <div className="grid gap-2">
        <details open={open} className="group">
          <summary className="cursor-pointer text-sm leading-5 font-medium text-primary hover:underline">
            {m.consentReadForm()}
          </summary>
          <div className="mt-3 rounded-md border bg-muted/30 px-4 py-3">
            {form.body ? (
              <TranslatedView
                body={form.body}
                translation={form.translation}
                primary={form.primaryLocale}
                locale={locale}
                onLocaleChange={setLocale}
              />
            ) : null}
          </div>
        </details>
        <RecordList>
          {learners.map((learner) => (
            <LearnerAnswer
              key={learner.studentId}
              learner={learner}
              form={form}
            />
          ))}
        </RecordList>
      </div>
      {printing.sheet}
    </RecordSection>
  );
}

/**
 * The school's consent forms for the viewer: each form's words, and for
 * themself or every learner they follow an answer they can give or change
 * at any time where they decide. Forms still waiting on an answer come first.
 */
export function LearnerConsents() {
  const data = useSuspenseQuery(myConsentsQuery).data;
  // Ordered once as the page opens, so a card does not jump away the moment
  // it is answered.
  const [order] = useState(() => {
    const owed = (form: Form) =>
      data.learners.some(
        (learner) =>
          learner.mayAnswer && waiting(answerTo(learner, form), form),
      );
    return data.forms
      .toSorted((a, b) => Number(owed(b)) - Number(owed(a)))
      .map((form) => form.id);
  });
  const rank = (form: Form) => {
    const index = order.indexOf(form.id);
    return index === -1 ? order.length : index;
  };
  const forms = data.forms.toSorted((a, b) => rank(a) - rank(b));
  if (data.forms.length === 0 || data.learners.length === 0)
    return (
      <EmptyState
        icon={ShieldCheck}
        title={m.consentFamilyNone()}
        description={m.consentFamilyNoneBody()}
      />
    );
  return (
    <div className="grid gap-6">
      {forms.map((form) => (
        <FormCard key={form.id} form={form} learners={data.learners} />
      ))}
    </div>
  );
}
