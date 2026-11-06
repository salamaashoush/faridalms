import { saveYearSchema } from "@faridalms/domain/years";
import { Button } from "@faridalms/ui/button";
import { TextField } from "@faridalms/ui/system/form-field";
import { FormSection, RecordForm } from "@faridalms/ui/system/record-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { yearQuery } from "~/queries/years";

import * as m from "~/i18n/messages";
import { saveYear } from "~/server/years";
import { refusalOf } from "~/utils/error";
import { schemaErrors } from "~/utils/validation";

import { lastDay } from "../people/format";

type YearData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof yearQuery>["queryFn"]>>
>;

interface TermDraft {
  key: number;
  id?: string;
  titleEn: string;
  titleAr: string;
  startsOn: string;
  endsOn: string;
}

interface Draft {
  titleEn: string;
  titleAr: string;
  startsOn: string;
  endsOn: string;
  terms: TermDraft[];
}

type Field = "titles" | "startsOn" | "endsOn" | "terms";

const FIELD_OF: Partial<Record<string, Field>> = {
  titleEn: "titles",
  titleAr: "titles",
  startsOn: "startsOn",
  endsOn: "endsOn",
  terms: "terms",
};

/** Refusals from the server that are about one field, shown on that field. */
const FIELD_ERRORS: Partial<Record<string, Field>> = {
  "school_year.overlapping": "startsOn",
  "school_year.end_year_fixed": "endsOn",
  "school_year.end_mismatch": "endsOn",
  "school_year.rows_outside_dates": "startsOn",
  "validation.end_date": "endsOn",
  "validation.term_outside": "terms",
  "validation.term_overlap": "terms",
  "validation.term_name_conflict": "terms",
  "academic_session.overlapping": "terms",
};

function initialDraft(year: YearData | null): Draft {
  if (!year)
    return { titleEn: "", titleAr: "", startsOn: "", endsOn: "", terms: [] };
  return {
    titleEn: year.titleEn ?? "",
    titleAr: year.titleAr ?? "",
    startsOn: year.startsOn,
    endsOn: lastDay(year.endsBefore),
    terms: year.terms.map((term, index) => ({
      key: index + 1,
      id: term.id,
      titleEn: term.titleEn ?? "",
      titleAr: term.titleAr ?? "",
      startsOn: term.startsOn,
      endsOn: lastDay(term.endsBefore),
    })),
  };
}

export function YearEditor({
  year = null,
  onClose,
}: {
  year?: YearData | null;
  onClose: (id?: string) => void;
}) {
  const queryClient = useQueryClient();
  const leaving = useRef(false);
  const nextKey = useRef((year?.terms.length ?? 0) + 1);
  const [initial] = useState(() => initialDraft(year));
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setErrors((current) => ({
      ...current,
      ...(key === "titleEn" || key === "titleAr" ? { titles: undefined } : {}),
      ...(key === "startsOn" ? { startsOn: undefined } : {}),
      ...(key === "endsOn" ? { endsOn: undefined } : {}),
      terms: undefined,
    }));
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const setTerm = (key: number, change: Partial<TermDraft>) =>
    set(
      "terms",
      draft.terms.map((term) =>
        term.key === key ? { ...term, ...change } : term,
      ),
    );
  const payload = {
    ...(year ? { id: year.id, expectedVersion: year.version } : {}),
    titleEn: draft.titleEn,
    titleAr: draft.titleAr,
    startsOn: draft.startsOn,
    endsOn: draft.endsOn,
    terms: draft.terms.map((term) => ({
      ...(term.id ? { id: term.id } : {}),
      titleEn: term.titleEn,
      titleAr: term.titleAr,
      startsOn: term.startsOn,
      endsOn: term.endsOn,
    })),
  };
  const mutation = useMutation({
    mutationFn: () => saveYear({ data: payload }),
    meta: { inlineError: true },
  });
  const validate = () =>
    schemaErrors(saveYearSchema, payload, (key) => FIELD_OF[key], {
      terms: m.yearsTermIncomplete(),
    });
  const refusal = refusalOf(mutation.error, FIELD_ERRORS);
  const failure = refusal && !refusal.field ? refusal.message : null;
  const fieldError = (field: Field) =>
    errors[field] ? [errors[field]] : undefined;
  return (
    <RecordForm
      title={year ? m.yearsEdit() : m.yearsAdd()}
      description={year ? undefined : m.yearsAddHint()}
      onSubmit={async () => {
        const found = validate();
        setErrors(found);
        if (Object.keys(found).length > 0) return;
        let saved: { id: string };
        try {
          saved = await mutation.mutateAsync();
        } catch (error) {
          const refused = refusalOf(error, FIELD_ERRORS);
          if (refused?.field) setErrors({ [refused.field]: refused.message });
          return;
        }
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["years"] }),
          queryClient.invalidateQueries({ queryKey: ["classes"] }),
          queryClient.invalidateQueries({ queryKey: ["people"] }),
        ]);
        leaving.current = true;
        toast.success(m.managementSaved());
        onClose(saved.id);
      }}
      onCancel={() => onClose()}
      isDirty={() =>
        !leaving.current && JSON.stringify(draft) !== JSON.stringify(initial)
      }
      pending={mutation.isPending}
      error={failure}
    >
      <FormSection title={m.yearsDetails()}>
        <TextField
          id="year-title-ar"
          label={m.yearsNameArabic()}
          dir="rtl"
          width="name"
          maxLength={80}
          autoComplete="off"
          value={draft.titleAr}
          onChange={(event) => set("titleAr", event.target.value)}
          errors={fieldError("titles")}
        />
        <TextField
          id="year-title-en"
          label={m.yearsNameEnglish()}
          hint={m.yearsNameHint()}
          dir="ltr"
          width="name"
          maxLength={80}
          autoComplete="off"
          value={draft.titleEn}
          onChange={(event) => set("titleEn", event.target.value)}
        />
        <TextField
          id="year-starts"
          label={m.yearsFirstDay()}
          type="date"
          width="date"
          value={draft.startsOn}
          onChange={(event) => set("startsOn", event.target.value)}
          errors={fieldError("startsOn")}
        />
        <TextField
          id="year-ends"
          label={m.yearsLastDay()}
          hint={
            year
              ? m.yearsLastDayFixed({ year: String(year.schoolYear) })
              : m.yearsLastDayHint()
          }
          type="date"
          width="date"
          min={draft.startsOn || undefined}
          value={draft.endsOn}
          onChange={(event) => set("endsOn", event.target.value)}
          errors={fieldError("endsOn")}
        />
      </FormSection>
      <FormSection title={m.yearsTerms()} description={m.yearsTermsHint()}>
        {draft.terms.map((term, index) => (
          <fieldset
            key={term.key}
            className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2"
          >
            <legend className="sr-only">
              {m.yearsTermNumber({ number: index + 1 })}
            </legend>
            <TextField
              id={`term-title-ar-${term.key}`}
              label={m.yearsTermNameArabic()}
              dir="rtl"
              width="full"
              maxLength={80}
              autoComplete="off"
              value={term.titleAr}
              onChange={(event) =>
                setTerm(term.key, { titleAr: event.target.value })
              }
            />
            <TextField
              id={`term-title-en-${term.key}`}
              label={m.yearsTermNameEnglish()}
              dir="ltr"
              width="full"
              maxLength={80}
              autoComplete="off"
              value={term.titleEn}
              onChange={(event) =>
                setTerm(term.key, { titleEn: event.target.value })
              }
            />
            <TextField
              id={`term-starts-${term.key}`}
              label={m.yearsFirstDay()}
              type="date"
              width="date"
              min={draft.startsOn || undefined}
              max={draft.endsOn || undefined}
              value={term.startsOn}
              onChange={(event) =>
                setTerm(term.key, { startsOn: event.target.value })
              }
            />
            <div className="flex items-end gap-3">
              <TextField
                id={`term-ends-${term.key}`}
                label={m.yearsLastDay()}
                type="date"
                width="date"
                min={term.startsOn || draft.startsOn || undefined}
                max={draft.endsOn || undefined}
                value={term.endsOn}
                onChange={(event) =>
                  setTerm(term.key, { endsOn: event.target.value })
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ms-auto max-md:size-10"
                aria-label={m.yearsRemoveTerm({ number: index + 1 })}
                onClick={() =>
                  set(
                    "terms",
                    draft.terms.filter((item) => item.key !== term.key),
                  )
                }
              >
                <X aria-hidden />
              </Button>
            </div>
          </fieldset>
        ))}
        {errors.terms ? (
          <p className="text-[13px] leading-[18px] text-destructive">
            {errors.terms}
          </p>
        ) : null}
        <Button
          type="button"
          variant="outline"
          className="justify-self-start max-md:h-10"
          onClick={() => {
            const key = nextKey.current;
            nextKey.current += 1;
            set("terms", [
              ...draft.terms,
              {
                key,
                titleEn: "",
                titleAr: "",
                startsOn: "",
                endsOn: "",
              },
            ]);
          }}
        >
          <Plus aria-hidden />
          {m.yearsAddTerm()}
        </Button>
      </FormSection>
    </RecordForm>
  );
}
