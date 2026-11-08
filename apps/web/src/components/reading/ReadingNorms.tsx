import type {
  NormPercentile,
  NormRow,
  ReadingLanguage,
  ReadingSeason,
} from "@faridalms/domain/reading";

import { CATALOGUE } from "@faridalms/domain/descriptors/catalogue";
import {
  MAX_NORM_ROWS,
  NORM_PERCENTILES,
  READING_LANGUAGES,
  READING_SEASONS,
} from "@faridalms/domain/reading";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import { SelectField } from "@faridalms/ui/system/form-field";
import { SettingsSection } from "@faridalms/ui/system/settings-section";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { LOCALE_NAME } from "~/components/content/languages";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { readingNormsQuery } from "~/queries/reading";
import { resetReadingNorms, saveReadingNorms } from "~/server/reading";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

/** The grade levels norms are written for, by their fixed meaning. */
const GRADES = (
  CATALOGUE.find((space) => space.namespace === "grade_level")?.values ?? []
).flatMap((value) => (value.meaning ? [value] : []));

const gradeName = (meaning: string) => {
  const found = GRADES.find((value) => value.meaning === meaning);
  return found ? inLocale(found.en, found.ar) : meaning;
};

const SEASON_LABEL: Record<ReadingSeason, () => string> = {
  fall: m.readingSeasonFall,
  winter: m.readingSeasonWinter,
  spring: m.readingSeasonSpring,
};

const PERCENTILE_LABEL: Record<NormPercentile, () => string> = {
  p10: () => m.readingPercentile({ value: formatNumber(10) }),
  p25: () => m.readingPercentile({ value: formatNumber(25) }),
  p50: () => m.readingPercentile({ value: formatNumber(50) }),
  p75: () => m.readingPercentile({ value: formatNumber(75) }),
  p90: () => m.readingPercentile({ value: formatNumber(90) }),
};

const order = (rows: readonly NormRow[]) =>
  rows.toSorted(
    (a, b) =>
      GRADES.findIndex((value) => value.meaning === a.grade) -
        GRADES.findIndex((value) => value.meaning === b.grade) ||
      READING_SEASONS.indexOf(a.season) - READING_SEASONS.indexOf(b.season),
  );

interface LanguageNormsProps {
  language: ReadingLanguage;
  rows: NormRow[];
  own: boolean;
  version: number;
}

/** One language's norms, written grade by grade and time of year by time of year. */
function LanguageNorms({ language, rows, own, version }: LanguageNormsProps) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => order(rows));
  const [adding, setAdding] = useState<{ grade: string; season: string }>({
    grade: "",
    season: "fall",
  });
  const [resetting, setResetting] = useState(false);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: readingNormsQuery.queryKey });
  const save = useMutation({
    mutationFn: () =>
      saveReadingNorms({
        data: { language, rows: draft, expectedVersion: version },
      }),
    onSuccess: async () => {
      toast.success(m.readingNormsSaved());
      await refresh();
    },
  });
  const reset = useMutation({
    mutationFn: () => resetReadingNorms({ data: { language } }),
    onSuccess: async () => {
      setResetting(false);
      toast.success(m.readingNormsReset());
      await refresh();
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const change = (index: number, percentile: NormPercentile, text: string) => {
    const value = text.trim() === "" ? null : Math.round(Number(text));
    if (value !== null && !(value >= 0 && value <= 400)) return;
    setDraft(
      draft.map((row, at) =>
        at === index ? { ...row, [percentile]: value } : row,
      ),
    );
  };
  const taken = new Set(draft.map((row) => `${row.grade}:${row.season}`));
  const canAdd =
    adding.grade !== "" &&
    !taken.has(`${adding.grade}:${adding.season}`) &&
    draft.length < MAX_NORM_ROWS;
  return (
    <SettingsSection
      title={m.readingNormsFor({ language: LOCALE_NAME[language]() })}
      description={
        own
          ? m.readingNormsOwn()
          : language === "en"
            ? m.readingNormsDefaultEn()
            : m.readingNormsDefaultAr()
      }
      onSubmit={() => save.mutateAsync().catch(() => null)}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      isDirty={() => JSON.stringify(draft) !== JSON.stringify(order(rows))}
      footer={
        own ? (
          <Button
            type="button"
            variant="ghost"
            className="max-md:h-10"
            onClick={() => setResetting(true)}
          >
            <RotateCcw aria-hidden />
            {m.readingNormsResetAction()}
          </Button>
        ) : undefined
      }
    >
      <div className="grid gap-3">
        {draft.length ? (
          <section
            className="overflow-x-auto"
            aria-label={m.readingNormsTable()}
          >
            <table className="w-full min-w-[40rem] text-sm">
              <caption className="sr-only">
                {m.readingNormsFor({ language: LOCALE_NAME[language]() })}
              </caption>
              <thead>
                <tr className="text-start text-[13px] text-muted-foreground">
                  <th scope="col" className="py-2 pe-3 text-start font-medium">
                    {m.readingGrade()}
                  </th>
                  <th scope="col" className="py-2 pe-3 text-start font-medium">
                    {m.readingSeason()}
                  </th>
                  {NORM_PERCENTILES.map((percentile) => (
                    <th
                      key={percentile}
                      scope="col"
                      className="py-2 pe-3 text-end font-medium"
                    >
                      {PERCENTILE_LABEL[percentile]()}
                    </th>
                  ))}
                  <th scope="col" className="sr-only">
                    {m.readingRemoveRow()}
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.map((row, index) => {
                  const name = `${gradeName(row.grade)}, ${SEASON_LABEL[row.season]()}`;
                  return (
                    <tr key={`${row.grade}:${row.season}`} className="border-t">
                      <th
                        scope="row"
                        className="py-1.5 pe-3 text-start font-medium"
                      >
                        {gradeName(row.grade)}
                      </th>
                      <td className="py-1.5 pe-3">
                        {SEASON_LABEL[row.season]()}
                      </td>
                      {NORM_PERCENTILES.map((percentile) => (
                        <td key={percentile} className="py-1.5 pe-3">
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={400}
                            aria-label={m.readingNormCell({
                              row: name,
                              percentile: PERCENTILE_LABEL[percentile](),
                            })}
                            className="h-8 w-20 text-end tabular-nums max-md:h-10"
                            value={row[percentile] ?? ""}
                            onChange={(event) =>
                              change(index, percentile, event.target.value)
                            }
                          />
                        </td>
                      ))}
                      <td className="py-1.5">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="max-md:size-10"
                          aria-label={m.readingRemoveRowNamed({ row: name })}
                          onClick={() =>
                            setDraft(draft.filter((_, at) => at !== index))
                          }
                        >
                          <Trash2 aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : (
          <p className="text-sm leading-5 text-muted-foreground">
            {m.readingNormsEmpty()}
          </p>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <SelectField
            id={`norm-${language}-grade`}
            label={m.readingGrade()}
            value={adding.grade || "none"}
            options={[
              { value: "none", label: m.readingChooseGrade() },
              ...GRADES.flatMap((value) =>
                value.meaning
                  ? [
                      {
                        value: value.meaning,
                        label: inLocale(value.en, value.ar),
                      },
                    ]
                  : [],
              ),
            ]}
            onChange={(grade) =>
              setAdding({ ...adding, grade: grade === "none" ? "" : grade })
            }
          />
          <SelectField
            id={`norm-${language}-season`}
            label={m.readingSeason()}
            value={adding.season}
            options={READING_SEASONS.map((season) => ({
              value: season,
              label: SEASON_LABEL[season](),
            }))}
            onChange={(season) => setAdding({ ...adding, season })}
          />
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            disabled={!canAdd}
            onClick={() => {
              setDraft(
                order([
                  ...draft,
                  {
                    grade: adding.grade,
                    season: adding.season as ReadingSeason,
                    p10: null,
                    p25: null,
                    p50: null,
                    p75: null,
                    p90: null,
                  },
                ]),
              );
              setAdding({ ...adding, grade: "" });
            }}
          >
            <Plus aria-hidden />
            {m.readingAddRow()}
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={resetting}
        title={m.readingNormsResetTitle({ language: LOCALE_NAME[language]() })}
        body={
          language === "en"
            ? m.readingNormsResetBodyEn()
            : m.readingNormsResetBodyAr()
        }
        confirmLabel={m.readingNormsResetAction()}
        pending={reset.isPending}
        onConfirm={() => reset.mutate()}
        onCancel={() => setResetting(false)}
      />
    </SettingsSection>
  );
}

/**
 * The words correct a minute the school expects of each grade reading
 * aloud, in English and Arabic: what each student's readings are read
 * against on their record.
 */
export function ReadingNorms() {
  const norms = useSuspenseQuery(readingNormsQuery).data;
  return (
    <>
      {READING_LANGUAGES.map((language) => (
        <LanguageNorms
          key={`${language}-${norms[language].version}-${norms[language].own}`}
          language={language}
          {...norms[language]}
        />
      ))}
    </>
  );
}
