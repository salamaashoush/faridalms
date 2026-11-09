import type {
  NormPercentile,
  NormRow,
  ReadingLanguage,
  ReadingSeason,
} from "@faridalms/domain/reading";
import type { GridColumn, GridIssue } from "@faridalms/ui/system/data-grid";

import { CATALOGUE } from "@faridalms/domain/descriptors/catalogue";
import {
  DEFAULT_NORMS,
  fallingPercentiles,
  NORM_PERCENTILES,
  READING_LANGUAGES,
  READING_SEASONS,
} from "@faridalms/domain/reading";
import { Button } from "@faridalms/ui/button";
import { ConfirmDialog } from "@faridalms/ui/system/confirm-dialog";
import {
  DataGrid,
  GridAddButton,
  GridFigure,
  NumberCell,
  useFocusAfterRender,
} from "@faridalms/ui/system/data-grid";
import { EmptyState } from "@faridalms/ui/system/empty-state";
import { SettingsSection } from "@faridalms/ui/system/settings-section";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Pencil, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { LOCALE_NAME } from "~/components/content/languages";
import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { readingNormsQuery } from "~/queries/reading";
import { resetReadingNorms, saveReadingNorms } from "~/server/reading";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

/** The most words a minute a norm may hold, as the domain allows. */
const MOST_WORDS = 400;

/** The grade levels norms are written for, by their fixed meaning. */
const GRADES = (
  CATALOGUE.find((space) => space.namespace === "grade_level")?.values ?? []
).flatMap((value) => (value.meaning ? [value] : []));

const gradeName = (meaning: string) => {
  const found = GRADES.find((value) => value.meaning === meaning);
  return found ? inLocale(found.en, found.ar) : meaning;
};

const gradeRank = (meaning: string) =>
  GRADES.findIndex((value) => value.meaning === meaning);

const SEASON_LABEL: Record<ReadingSeason, () => string> = {
  fall: m.readingSeasonFall,
  winter: m.readingSeasonWinter,
  spring: m.readingSeasonSpring,
};

const SEASON_TITLE: Record<ReadingSeason, () => string> = {
  fall: m.readingSeasonFallTitle,
  winter: m.readingSeasonWinterTitle,
  spring: m.readingSeasonSpringTitle,
};

const PERCENTILE_VALUE: Record<NormPercentile, number> = {
  p10: 10,
  p25: 25,
  p50: 50,
  p75: 75,
  p90: 90,
};

const percentileLabel = (percentile: NormPercentile) =>
  m.readingPercentile({ value: formatNumber(PERCENTILE_VALUE[percentile]) });

const empty = (grade: string, season: ReadingSeason): NormRow => ({
  grade,
  season,
  p10: null,
  p25: null,
  p50: null,
  p75: null,
  p90: null,
});

const blank = (row: NormRow) =>
  NORM_PERCENTILES.every((percentile) => row[percentile] === null);

const find = (rows: readonly NormRow[], grade: string, season: ReadingSeason) =>
  rows.find((row) => row.grade === grade && row.season === season);

const gradesOf = (rows: readonly NormRow[]) =>
  [...new Set(rows.map((row) => row.grade))].toSorted(
    (a, b) => gradeRank(a) - gradeRank(b),
  );

/**
 * Every grade the rows name at all three times of year, so a time of year
 * with no norm reads as a row of dashes rather than going missing.
 */
const filled = (rows: readonly NormRow[]) =>
  gradesOf(rows).flatMap((grade) =>
    READING_SEASONS.map(
      (season) => find(rows, grade, season) ?? empty(grade, season),
    ),
  );

/**
 * What is kept: the rows with a figure, in order. A time of year with no
 * figure is no norm whether it is saved blank or not at all, since
 * readings are only ever set against a row's 50th percentile.
 */
const kept = (rows: readonly NormRow[]) =>
  filled(rows).filter((row) => !blank(row));

const cellId = (
  language: ReadingLanguage,
  row: Pick<NormRow, "grade" | "season">,
  percentile: NormPercentile,
) => `norm-${language}-${row.grade}-${row.season}-${percentile}`;

const cellName = (row: NormRow, percentile: NormPercentile) =>
  m.readingNormCell({
    row: m.readingNormRowName({
      grade: gradeName(row.grade),
      season: SEASON_LABEL[row.season](),
    }),
    percentile: percentileLabel(percentile),
  });

/** What is wrong with the figures as written, each tied to its cell. */
function issuesOf(
  language: ReadingLanguage,
  rows: readonly NormRow[],
): GridIssue[] {
  const issues: GridIssue[] = [];
  for (const grade of gradesOf(rows)) {
    const own = rows.filter((row) => row.grade === grade);
    if (own.every(blank))
      issues.push({
        target: cellId(language, { grade, season: "fall" }, "p10"),
        message: m.readingNormGradeEmpty({ grade: gradeName(grade) }),
      });
    for (const row of own) {
      for (const percentile of NORM_PERCENTILES) {
        const value = row[percentile];
        if (value !== null && value > MOST_WORDS)
          issues.push({
            target: cellId(language, row, percentile),
            message: m.readingNormTooHigh({
              cell: cellName(row, percentile),
              max: formatNumber(MOST_WORDS),
            }),
          });
      }
      for (const percentile of fallingPercentiles(row)) {
        const before = NORM_PERCENTILES.slice(
          0,
          NORM_PERCENTILES.indexOf(percentile),
        ).reduce<NormPercentile | null>(
          (highest, other) =>
            row[other] !== null &&
            (highest === null || (row[other] ?? 0) >= (row[highest] ?? 0))
              ? other
              : highest,
          null,
        );
        if (!before) continue;
        issues.push({
          target: cellId(language, row, percentile),
          message: m.readingNormLower({
            cell: cellName(row, percentile),
            percentile: percentileLabel(before),
            value: formatNumber(row[before] ?? 0),
          }),
        });
      }
    }
  }
  return issues;
}

interface PercentileColumnsOptions {
  language: ReadingLanguage;
  editing: boolean;
  baseline: (
    row: NormRow,
    percentile: NormPercentile,
  ) => number | null | undefined;
  onChange: (
    row: NormRow,
    percentile: NormPercentile,
    value: number | null,
  ) => void;
}

// Built per render: headers read the request's locale.
function percentileColumns({
  language,
  editing,
  baseline,
  onChange,
}: PercentileColumnsOptions): GridColumn<NormRow>[] {
  return NORM_PERCENTILES.map((percentile) => ({
    id: percentile,
    header: m.readingPercentileShort({
      value: formatNumber(PERCENTILE_VALUE[percentile]),
    }),
    numeric: true,
    cell: (row) =>
      editing ? (
        <NumberCell
          id={cellId(language, row, percentile)}
          label={cellName(row, percentile)}
          value={row[percentile]}
          baseline={baseline(row, percentile)}
          placeholder="—"
          onChange={(value) => onChange(row, percentile, value)}
        />
      ) : (
        <GridFigure
          value={row[percentile]}
          baseline={baseline(row, percentile)}
        />
      ),
  }));
}

interface LanguageNormsProps {
  language: ReadingLanguage;
  rows: NormRow[];
  own: boolean;
  version: number;
}

/**
 * One language's norms: read as a table grade by grade, and changed in
 * the same table after Edit, each figure that differs from Hasbrouck and
 * Tindal's marked.
 */
function LanguageNorms({ language, rows, own, version }: LanguageNormsProps) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => filled(rows));
  const [checked, setChecked] = useState(false);
  const [resetting, setResetting] = useState(false);
  const focusLater = useFocusAfterRender();
  const editId = `norm-${language}-edit`;
  const languageName = LOCALE_NAME[language]();
  const defaults = DEFAULT_NORMS[language];
  const sourced = defaults.length > 0;
  const shown = editing ? draft : filled(rows);
  const issues = checked ? issuesOf(language, draft) : [];
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: readingNormsQuery.queryKey });
  const save = useMutation({
    mutationFn: () =>
      saveReadingNorms({
        data: { language, rows: kept(draft), expectedVersion: version },
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
  const baseline = (row: NormRow, percentile: NormPercentile) => {
    if (!sourced) return undefined;
    const source = find(defaults, row.grade, row.season);
    if (!source && !defaults.some((item) => item.grade === row.grade))
      return undefined;
    return source?.[percentile] ?? null;
  };
  const changed = shown.reduce(
    (count, row) =>
      count +
      NORM_PERCENTILES.filter((percentile) => {
        const from = baseline(row, percentile);
        return from !== undefined && from !== row[percentile];
      }).length,
    0,
  );
  const startEditing = () => {
    setDraft(filled(rows));
    setChecked(false);
    setEditing(true);
    const first = filled(rows)[0];
    if (first) focusLater(cellId(language, first, "p10"));
  };
  const stopEditing = () => {
    setEditing(false);
    setChecked(false);
    save.reset();
    focusLater(editId);
  };
  const addGrade = (grade?: string) => {
    if (!grade) return;
    const base = editing ? draft : filled(rows);
    setDraft(
      filled([
        ...base,
        ...READING_SEASONS.map((season) => empty(grade, season)),
      ]),
    );
    setEditing(true);
    focusLater(cellId(language, { grade, season: "fall" }, "p10"));
  };
  const change = (
    target: NormRow,
    percentile: NormPercentile,
    value: number | null,
  ) =>
    setDraft((current) =>
      current.map((row) =>
        row.grade === target.grade && row.season === target.season
          ? { ...row, [percentile]: value }
          : row,
      ),
    );
  const groups = gradesOf(shown).map((grade) => {
    const inSource = defaults.some((row) => row.grade === grade);
    const gradeRows = shown.filter((row) => row.grade === grade);
    const differs = gradeRows.some((row) =>
      NORM_PERCENTILES.some(
        (percentile) => baseline(row, percentile) !== row[percentile],
      ),
    );
    return {
      id: grade,
      title: gradeName(grade),
      note: sourced && !inSource ? m.readingNormsAdded() : undefined,
      actions: [
        ...(sourced && inSource && differs
          ? [
              {
                label: m.readingNormsBackToSource(),
                icon: RotateCcw,
                onSelect: () =>
                  setDraft((current) =>
                    current.map((row) =>
                      row.grade === grade
                        ? (find(defaults, grade, row.season) ??
                          empty(grade, row.season))
                        : row,
                    ),
                  ),
              },
            ]
          : []),
        {
          label: m.readingRemoveGrade({ grade: gradeName(grade) }),
          onSelect: () =>
            setDraft((current) => current.filter((row) => row.grade !== grade)),
        },
      ],
      rows: gradeRows,
    };
  });
  const present = new Set(gradesOf(shown));
  const addChoices = GRADES.flatMap((value) =>
    value.meaning && !present.has(value.meaning)
      ? [{ value: value.meaning, label: inLocale(value.en, value.ar) }]
      : [],
  );
  const addButton = (
    <GridAddButton
      label={m.readingAddRow()}
      choices={addChoices}
      onAdd={addGrade}
    />
  );
  const columns = percentileColumns({
    language,
    editing,
    baseline,
    onChange: change,
  });
  const description = own
    ? m.readingNormsOwn()
    : language === "en"
      ? m.readingNormsDefaultEn()
      : m.readingNormsDefaultAr();
  const title = m.readingNormsFor({ language: languageName });
  const body = groups.length ? (
    <DataGrid<NormRow>
      caption={m.readingNormsTable({ language: languageName })}
      editing={editing}
      rowHeader={{
        header: m.readingSeason(),
        cell: (row) => SEASON_TITLE[row.season](),
      }}
      columnGroup={m.readingPercentiles()}
      columns={columns}
      groups={groups}
      rowKey={(row) => `${row.grade}:${row.season}`}
      baselineName={sourced ? m.readingNormsSource() : undefined}
      legend={{
        changed,
        empty:
          !editing && shown.some((row) => blank(row))
            ? m.readingNormsNoNorm()
            : undefined,
      }}
      issues={issues}
      footer={addButton}
    />
  ) : (
    <EmptyState
      placement="section"
      title={m.readingNormsEmpty()}
      action={addButton}
    />
  );
  return (
    <SettingsSection
      title={title}
      description={description}
      onSubmit={
        editing
          ? async () => {
              setChecked(true);
              if (issuesOf(language, draft).length) return;
              await save.mutateAsync().catch(() => null);
            }
          : undefined
      }
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      isDirty={
        editing
          ? () => JSON.stringify(kept(draft)) !== JSON.stringify(kept(rows))
          : undefined
      }
      footer={
        editing ? (
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={stopEditing}
          >
            {m.commonCancel()}
          </Button>
        ) : groups.length || own ? (
          <>
            {groups.length ? (
              <Button
                id={editId}
                type="button"
                variant="outline"
                className="max-md:h-10"
                onClick={startEditing}
              >
                <Pencil aria-hidden />
                {m.readingNormsEdit({ language: languageName })}
              </Button>
            ) : null}
            {own ? (
              <Button
                type="button"
                variant="ghost"
                className="max-md:h-10"
                onClick={() => setResetting(true)}
              >
                <RotateCcw aria-hidden />
                {m.readingNormsResetAction()}
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    >
      {body}
      <ConfirmDialog
        open={resetting}
        title={m.readingNormsResetTitle({ language: languageName })}
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
