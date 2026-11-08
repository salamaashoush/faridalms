import type { AdmissionQuestions } from "@faridalms/domain/admissions";
import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";

import { formUnready } from "@faridalms/domain/admissions";
import { CONTENT_LOCALES, otherLocale } from "@faridalms/domain/translations";
import { SelectField, TextField } from "@faridalms/ui/system/form-field";
import { FormSection, RecordForm } from "@faridalms/ui/system/record-form";
import { Tabs, TabsList, TabsTrigger } from "@faridalms/ui/tabs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ContentEditor } from "~/components/content/ContentEditor";
import { LOCALE_LABEL, LOCALE_NAME } from "~/components/content/languages";
import * as m from "~/i18n/messages";
import { publishForm, saveForm } from "~/server/admissions";
import { getMessageFromError } from "~/utils/error";

export interface FormDraft extends AdmissionQuestions {
  id: string;
  version: number;
  nameEn: string;
  nameAr: string;
  published: boolean;
}

export interface FormEditorProps {
  initial: FormDraft;
  onDone: () => void;
}

/**
 * An application form's own questions, written as question blocks in the
 * language the school chose first, with their translation beside them.
 * Saving keeps the draft; publishing makes it the version new applications
 * are answered against.
 */
export function FormEditor({ initial, onDone }: FormEditorProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(initial);
  const leaving = useRef(false);
  const [writing, setWriting] = useState<ContentLocale>(initial.primaryLocale);
  const [tried, setTried] = useState(false);
  const other = otherLocale(draft.primaryLocale);
  const translating = writing === other;
  const save = useMutation({
    mutationFn: async (intent: string | undefined) => {
      const saved = await saveForm({
        data: {
          id: draft.id,
          expectedVersion: draft.version,
          nameEn: draft.nameEn,
          nameAr: draft.nameAr,
          primaryLocale: draft.primaryLocale,
          body: draft.body,
          translation: draft.translation,
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
  const nameError =
    !draft.nameEn.trim() && !draft.nameAr.trim() ? m.afmErrName() : null;
  const unready = formUnready(draft) !== null;
  // A translation starts as the original, its words rewritten in place, so
  // each question keeps what it asks.
  const shown: ContentDocument = translating
    ? (draft.translation ?? draft.body)
    : draft.body;

  return (
    <RecordForm
      title={draft.id ? m.afmEditTitle() : m.afmNewTitle()}
      description={m.afmEditorHint()}
      isDirty={() =>
        !leaving.current && JSON.stringify(draft) !== JSON.stringify(initial)
      }
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      secondary={{ label: m.afmSavePublish(), intent: "publish" }}
      onCancel={onDone}
      onSubmit={async (intent) => {
        setTried(true);
        if (nameError) return;
        if (intent === "publish" && unready) return;
        await save.mutateAsync(intent);
        await queryClient.invalidateQueries({ queryKey: ["admissions"] });
        leaving.current = true;
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
        <SelectField
          id="form-language"
          label={m.afmLanguage()}
          value={draft.primaryLocale}
          options={CONTENT_LOCALES.map((locale) => ({
            value: locale,
            label: LOCALE_NAME[locale](),
          }))}
          onChange={(primaryLocale) => {
            setDraft({ ...draft, primaryLocale });
            setWriting(primaryLocale);
          }}
          width="name"
        />
        <Tabs
          value={writing}
          onValueChange={(value: ContentLocale) => setWriting(value)}
        >
          <TabsList aria-label={m.contentLanguage()}>
            <TabsTrigger value={draft.primaryLocale} lang={draft.primaryLocale}>
              {LOCALE_LABEL[draft.primaryLocale]()}
            </TabsTrigger>
            <TabsTrigger value={other} lang={other}>
              {LOCALE_LABEL[other]()}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {translating ? (
          <p className="text-sm text-muted-foreground">
            {m.afmTranslationHint()}
          </p>
        ) : null}
        <div lang={writing} dir={writing === "ar" ? "rtl" : "ltr"}>
          <ContentEditor
            key={writing}
            id={`form-questions-${writing}`}
            label={m.afmSectionQuestions()}
            value={shown}
            questions
            forms
            language={writing}
            onChange={(next) =>
              setDraft((current) =>
                translating
                  ? { ...current, translation: next }
                  : { ...current, body: next },
              )
            }
          />
        </div>
        {tried && unready ? (
          <p className="text-[13px] text-destructive">
            {m.afmQuestionUnready()}
          </p>
        ) : null}
      </FormSection>
    </RecordForm>
  );
}
