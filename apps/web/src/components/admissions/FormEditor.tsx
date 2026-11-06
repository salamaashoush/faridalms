import type { AdmissionQuestion } from "@faridalms/domain/admissions";
import type { QuestionKind } from "@faridalms/domain/enquiries";

import {
  MAX_APPLICATION_QUESTIONS,
  questionReady,
} from "@faridalms/domain/admissions";
import { QUESTION_KINDS } from "@faridalms/domain/enquiries";
import { Button } from "@faridalms/ui/button";
import {
  FormField,
  SelectField,
  TextField,
} from "@faridalms/ui/system/form-field";
import { FormSection, RecordForm } from "@faridalms/ui/system/record-form";
import { Textarea } from "@faridalms/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { publishForm, saveForm } from "~/server/admissions";
import { getMessageFromError } from "~/utils/error";

import { ANSWER_LABEL } from "./application-labels";

export interface FormDraft {
  id: string;
  version: number;
  nameEn: string;
  nameAr: string;
  questions: AdmissionQuestion[];
  published: boolean;
}

const blank = (): AdmissionQuestion => ({
  id: crypto.randomUUID(),
  answer: "short",
  required: "optional",
  labelEn: "",
  labelAr: "",
  hintEn: "",
  hintAr: "",
  optionsEn: "",
  optionsAr: "",
});

/**
 * An application form's own questions, each worded in both languages, of
 * the same kinds the website's enquiry form asks. Saving keeps the draft;
 * publishing makes it the version new applications are answered against.
 */
export function FormEditor({
  initial,
  onDone,
}: {
  initial: FormDraft;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const [tried, setTried] = useState(false);
  const save = useMutation({
    mutationFn: async (intent: string | undefined) => {
      const saved = await saveForm({
        data: {
          id: draft.id,
          expectedVersion: draft.version,
          nameEn: draft.nameEn,
          nameAr: draft.nameAr,
          questions: draft.questions,
        },
      });
      if (intent === "publish")
        await publishForm({
          data: { id: saved.id, expectedVersion: saved.version },
        });
      return intent;
    },
    meta: { inlineError: true },
  });
  const setQuestion = (index: number, patch: Partial<AdmissionQuestion>) =>
    setDraft((current) => ({
      ...current,
      questions: current.questions.map((question, at) =>
        at === index ? { ...question, ...patch } : question,
      ),
    }));
  const move = (index: number, by: -1 | 1) =>
    setDraft((current) => {
      const list = [...current.questions];
      const to = index + by;
      const [moved] = list.splice(index, 1);
      if (!moved || to < 0 || to > list.length) return current;
      list.splice(to, 0, moved);
      return { ...current, questions: list };
    });
  const nameError =
    !draft.nameEn.trim() && !draft.nameAr.trim() ? m.afmErrName() : null;

  return (
    <RecordForm
      title={draft.id ? m.afmEditTitle() : m.afmNewTitle()}
      description={m.afmEditorHint()}
      isDirty={() => JSON.stringify(draft) !== JSON.stringify(initial)}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      secondary={{ label: m.afmSavePublish(), intent: "publish" }}
      onCancel={onDone}
      onSubmit={async (intent) => {
        setTried(true);
        if (nameError) return;
        if (
          intent === "publish" &&
          draft.questions.some((question) => !questionReady(question))
        )
          return;
        await save.mutateAsync(intent);
        await queryClient.invalidateQueries({ queryKey: ["admissions"] });
        toast.success(intent === "publish" ? m.afmPublished() : m.afmSaved());
        onDone();
      }}
    >
      <FormSection title={m.afmSectionName()}>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="form-name-en"
            label={m.afmNameEn()}
            dir="ltr"
            value={draft.nameEn}
            maxLength={120}
            onChange={(event) =>
              setDraft({ ...draft, nameEn: event.target.value })
            }
            errors={tried && nameError ? [nameError] : undefined}
          />
          <TextField
            id="form-name-ar"
            label={m.afmNameAr()}
            dir="rtl"
            value={draft.nameAr}
            maxLength={120}
            onChange={(event) =>
              setDraft({ ...draft, nameAr: event.target.value })
            }
          />
        </div>
      </FormSection>
      <FormSection
        title={m.afmSectionQuestions()}
        description={m.afmSectionQuestionsHint()}
      >
        <ol className="grid gap-4" aria-label={m.afmSectionQuestions()}>
          {draft.questions.map((question, index) => {
            const unready = tried && !questionReady(question);
            return (
              <li
                key={question.id}
                className="grid gap-3 rounded-lg border p-4"
                data-invalid={unready || undefined}
              >
                <div className="flex flex-wrap items-end gap-3">
                  <SelectField
                    id={`question-${question.id}-kind`}
                    label={m.afmQuestionKind()}
                    value={question.answer}
                    options={QUESTION_KINDS.map((kind: QuestionKind) => ({
                      value: kind,
                      label: ANSWER_LABEL[kind](),
                    }))}
                    onChange={(answer) => setQuestion(index, { answer })}
                    className="w-40"
                  />
                  <SelectField
                    id={`question-${question.id}-required`}
                    label={m.afmQuestionRequired()}
                    value={question.required}
                    options={[
                      { value: "optional", label: m.afmOptional() },
                      { value: "required", label: m.afmRequired() },
                    ]}
                    onChange={(required) => setQuestion(index, { required })}
                    className="w-36"
                  />
                  <div className="ms-auto flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === 0}
                      aria-label={m.afmQuestionUp({
                        number: String(index + 1),
                      })}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp aria-hidden className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === draft.questions.length - 1}
                      aria-label={m.afmQuestionDown({
                        number: String(index + 1),
                      })}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown aria-hidden className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={m.afmQuestionRemove({
                        number: String(index + 1),
                      })}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          questions: draft.questions.filter(
                            (_, at) => at !== index,
                          ),
                        })
                      }
                    >
                      <Trash2 aria-hidden className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextField
                    id={`question-${question.id}-label-en`}
                    label={m.afmQuestionLabelEn()}
                    dir="ltr"
                    maxLength={120}
                    value={question.labelEn}
                    onChange={(event) =>
                      setQuestion(index, { labelEn: event.target.value })
                    }
                  />
                  <TextField
                    id={`question-${question.id}-label-ar`}
                    label={m.afmQuestionLabelAr()}
                    dir="rtl"
                    maxLength={120}
                    value={question.labelAr}
                    onChange={(event) =>
                      setQuestion(index, { labelAr: event.target.value })
                    }
                  />
                  <TextField
                    id={`question-${question.id}-hint-en`}
                    label={m.afmQuestionHintEn()}
                    optional
                    dir="ltr"
                    maxLength={200}
                    value={question.hintEn}
                    onChange={(event) =>
                      setQuestion(index, { hintEn: event.target.value })
                    }
                  />
                  <TextField
                    id={`question-${question.id}-hint-ar`}
                    label={m.afmQuestionHintAr()}
                    optional
                    dir="rtl"
                    maxLength={200}
                    value={question.hintAr}
                    onChange={(event) =>
                      setQuestion(index, { hintAr: event.target.value })
                    }
                  />
                  {question.answer === "choice" ? (
                    <>
                      <OptionsField
                        id={`question-${question.id}-options-en`}
                        label={m.afmOptionsEn()}
                        dir="ltr"
                        value={question.optionsEn}
                        onChange={(optionsEn) =>
                          setQuestion(index, { optionsEn })
                        }
                      />
                      <OptionsField
                        id={`question-${question.id}-options-ar`}
                        label={m.afmOptionsAr()}
                        dir="rtl"
                        value={question.optionsAr}
                        onChange={(optionsAr) =>
                          setQuestion(index, { optionsAr })
                        }
                      />
                    </>
                  ) : null}
                </div>
                {unready ? (
                  <p className="text-[13px] text-destructive">
                    {m.afmQuestionUnready()}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          disabled={draft.questions.length >= MAX_APPLICATION_QUESTIONS}
          onClick={() =>
            setDraft({ ...draft, questions: [...draft.questions, blank()] })
          }
        >
          <Plus aria-hidden className="size-4" />
          {m.afmQuestionAdd()}
        </Button>
      </FormSection>
    </RecordForm>
  );
}

function OptionsField({
  id,
  label,
  dir,
  value,
  onChange,
}: {
  id: string;
  label: string;
  dir: "ltr" | "rtl";
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormField id={id} label={label} hint={m.afmOptionsHint()}>
      {(control) => (
        <Textarea
          {...control}
          dir={dir}
          rows={4}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </FormField>
  );
}
