import type {
  NormPercentile,
  NormRow,
  ReadingLanguage,
  ReadingSeason,
} from "@faridalms/domain/reading";
import type { Column, RowAction } from "@faridalms/ui/system/data-table";
import type { ReactNode } from "react";

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
import { DataTable, RowButton } from "@faridalms/ui/system/data-table";
import { NumberField, SelectField } from "@faridalms/ui/system/form-field";
import { RecordSection } from "@faridalms/ui/system/record-page";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { BookOpenText, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
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

const percentileShort = (percentile: NormPercentile) =>
  m.readingPercentileShort({
    value: formatNumber(PERCENTILE_VALUE[percentile]),
  });

type Figures = Pick<NormRow, NormPercentile>;

const NO_FIGURES: Figures = {
  p10: null,
  p25: null,
  p50: null,
  p75: null,
  p90: null,
};

const empty = (grade: string, season: ReadingSeason): NormRow => ({
  grade,
  season,
  ...NO_FIGURES,
});

const blank = (row: Figures) =>
  NORM_PERCENTILES.every((percentile) => row[percentile] === null);

const find = (rows: readonly NormRow[], grade: string, season: ReadingSeason) =>
  rows.find((row) => row.grade === grade && row.season === season);

const same = (
  a: Pick<NormRow, "grade" | "season">,
  b: Pick<NormRow, "grade" | "season">,
) => a.grade === b.grade && a.season === b.season;

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

/** The rows with one put in place of the row for its grade and time of year. */
const withRow = (rows: readonly NormRow[], next: NormRow) =>
  kept([...rows.filter((row) => !same(row, next)), next]);

const rowName = (row: Pick<NormRow, "grade" | "season">) =>
  m.readingNormRowName({
    grade: gradeName(row.grade),
    season: SEASON_LABEL[row.season](),
  });

const rowKey = (row: Pick<NormRow, "grade" | "season">) =>
  `${row.grade}:${row.season}`;

/** What is wrong with one row's figures, each said on its own field. */
function figureErrors(
  figures: Figures,
): Partial<Record<NormPercentile, string>> {
  const errors: Partial<Record<NormPercentile, string>> = {};
  if (blank(figures)) {
    errors.p10 = m.readingNormNeedsFigure();
    return errors;
  }
  for (const percentile of NORM_PERCENTILES) {
    const value = figures[percentile];
    if (value !== null && value > MOST_WORDS)
      errors[percentile] = m.readingNormFieldTooHigh({
        max: formatNumber(MOST_WORDS),
      });
  }
  const row = { grade: "", season: "fall" as const, ...figures };
  for (const percentile of fallingPercentiles(row)) {
    if (errors[percentile]) continue;
    const before = NORM_PERCENTILES.slice(
      0,
      NORM_PERCENTILES.indexOf(percentile),
    ).reduce<NormPercentile | null>(
      (highest, other) =>
        figures[other] !== null &&
        (highest === null || (figures[other] ?? 0) >= (figures[highest] ?? 0))
          ? other
          : highest,
      null,
    );
    if (!before) continue;
    errors[percentile] = m.readingNormFieldLower({
      percentile: percentileLabel(before),
      value: formatNumber(figures[before] ?? 0),
    });
  }
  return errors;
}

interface Source {
  /** Who published the figures the school starts from. */
  name: string;
  rows: readonly NormRow[];
}

/**
 * The published figures for a grade at a time of year, null where the
 * source has none, or undefined when the source does not cover the grade.
 */
function sourceRow(source: Source | null, row: NormRow) {
  if (!source || !source.rows.some((item) => item.grade === row.grade))
    return undefined;
  return (
    find(source.rows, row.grade, row.season) ?? empty(row.grade, row.season)
  );
}

const differs = (a: Figures, b: Figures) =>
  NORM_PERCENTILES.some((percentile) => a[percentile] !== b[percentile]);

interface SourceStatusProps {
  source: Source;
  row: NormRow;
}

function SourceStatus({ source, row }: SourceStatusProps) {
  const from = sourceRow(source, row);
  if (from === undefined)
    return <StatusText tone="info">{m.readingNormsAdded()}</StatusText>;
  if (differs(from, row))
    return <StatusText tone="info">{m.readingNormChanged()}</StatusText>;
  return <span className="text-muted-foreground">{source.name}</span>;
}

interface FigureProps {
  value: number | null;
}

function Figure({ value }: FigureProps) {
  if (value === null)
    return (
      <span className="text-muted-foreground">
        <span aria-hidden>—</span>
        <span className="sr-only">{m.readingNormsNoNorm()}</span>
      </span>
    );
  return <span className="tabular-nums">{formatNumber(value)}</span>;
}

/** The figures of a row on one line, as a phone's card reads them. */
function figuresLine(row: NormRow) {
  if (blank(row)) return m.readingNormsNoNorm();
  return NORM_PERCENTILES.flatMap((percentile) => {
    const value = row[percentile];
    return value === null
      ? []
      : [
          m.readingNormCardFigure({
            percentile: percentileShort(percentile),
            value: formatNumber(value),
          }),
        ];
  }).join(" · ");
}

interface NormSheetProps {
  language: ReadingLanguage;
  rows: NormRow[];
  version: number;
  source: Source | null;
  /** The row being changed; none to add one. */
  row: NormRow | null;
  open: boolean;
  onClose: () => void;
}

/**
 * One grade's figures at one time of year, each percentile its own field,
 * with the published figure it started from under it.
 */
function NormSheet({
  language,
  rows,
  version,
  source,
  row,
  open,
  onClose,
}: NormSheetProps) {
  const queryClient = useQueryClient();
  const openSeasons = (grade: string) =>
    READING_SEASONS.filter((season) => {
      const found = find(rows, grade, season);
      return !found || blank(found);
    });
  const gradeChoices = GRADES.flatMap((value) =>
    value.meaning && openSeasons(value.meaning).length
      ? [{ value: value.meaning, label: inLocale(value.en, value.ar) }]
      : [],
  );
  const [grade, setGrade] = useState(
    () => row?.grade ?? gradeChoices[0]?.value ?? "",
  );
  const [season, setSeason] = useState<ReadingSeason>(
    () => row?.season ?? openSeasons(grade)[0] ?? "fall",
  );
  const [figures, setFigures] = useState<Figures>(() =>
    row
      ? {
          p10: row.p10,
          p25: row.p25,
          p50: row.p50,
          p75: row.p75,
          p90: row.p90,
        }
      : NO_FIGURES,
  );
  const [tried, setTried] = useState(false);
  const errors = tried ? figureErrors(figures) : {};
  const target: NormRow = { grade, season, ...figures };
  const from = sourceRow(source, target);
  const save = useMutation({
    mutationFn: () =>
      saveReadingNorms({
        data: {
          language,
          rows: withRow(rows, target),
          expectedVersion: version,
        },
      }),
    meta: { inlineError: true },
  });
  return (
    <SheetForm
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={row ? rowName(row) : m.readingNormAddTitle()}
      pending={save.isPending}
      error={save.error ? getMessageFromError(save.error) : null}
      onSubmit={async () => {
        setTried(true);
        if (!grade || Object.keys(figureErrors(figures)).length) return;
        try {
          await save.mutateAsync();
        } catch {
          return;
        }
        await queryClient.invalidateQueries({
          queryKey: readingNormsQuery.queryKey,
        });
        toast.success(m.readingNormsSaved());
        onClose();
      }}
    >
      {row ? null : (
        <>
          <SelectField
            id={`norm-${language}-grade`}
            label={m.readingGrade()}
            value={grade}
            options={gradeChoices}
            onChange={(next) => {
              setGrade(next);
              const seasons = openSeasons(next);
              if (!seasons.includes(season) && seasons[0])
                setSeason(seasons[0]);
            }}
            width="name"
          />
          <SelectField
            id={`norm-${language}-season`}
            label={m.readingSeason()}
            value={season}
            options={openSeasons(grade).map((value) => ({
              value,
              label: SEASON_TITLE[value](),
            }))}
            onChange={setSeason}
            width="date"
          />
        </>
      )}
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {m.readingNormFiguresHint()}
      </p>
      {NORM_PERCENTILES.map((percentile) => {
        const published = from?.[percentile];
        return (
          <NumberField
            key={percentile}
            id={`norm-${language}-${percentile}`}
            label={percentileLabel(percentile)}
            value={figures[percentile]}
            onChange={(value) =>
              setFigures((current) => ({ ...current, [percentile]: value }))
            }
            hint={
              source && from !== undefined
                ? published === null || published === undefined
                  ? m.readingNormFromSourceNone({ source: source.name })
                  : m.readingNormFromSource({
                      source: source.name,
                      value: formatNumber(published),
                    })
                : undefined
            }
            errors={errors[percentile] ? [errors[percentile]] : undefined}
          />
        );
      })}
    </SheetForm>
  );
}

type Opener = (row: NormRow, text: string) => ReactNode;

// Built per render: headers read the request's locale.
function normColumns(
  source: Source | null,
  opener: Opener,
): Column<NormRow & { id: string }>[] {
  return [
    {
      id: "grade",
      header: m.readingGrade(),
      primary: true,
      cell: (row) => opener(row, gradeName(row.grade)),
    },
    {
      id: "season",
      header: m.readingSeason(),
      cell: (row) => SEASON_TITLE[row.season](),
    },
    ...NORM_PERCENTILES.map((percentile) => ({
      id: percentile,
      header: percentileShort(percentile),
      align: "end" as const,
      cell: (row: NormRow) => <Figure value={row[percentile]} />,
    })),
    ...(source
      ? [
          {
            id: "source",
            header: m.readingNormSourceColumn(),
            cell: (row: NormRow) => <SourceStatus source={source} row={row} />,
          },
        ]
      : []),
  ];
}

function normCard(source: Source | null, opener: Opener) {
  return {
    title: (row: NormRow) => opener(row, rowName(row)),
    fact: figuresLine,
    // A phone has no room to say every row is still the source's, so its
    // card speaks only of a row the school changed or added.
    status: source
      ? (row: NormRow) => {
          const from = sourceRow(source, row);
          return from === undefined || differs(from, row) ? (
            <SourceStatus source={source} row={row} />
          ) : null;
        }
      : undefined,
  };
}

interface LanguageNormsProps {
  language: ReadingLanguage;
  rows: NormRow[];
  own: boolean;
  version: number;
}

/**
 * One language's norms as a table, a row for each grade at each time of
 * year. A row opens on its own to be changed, and says whether its figures
 * are still Hasbrouck and Tindal's.
 */
function LanguageNorms({ language, rows, own, version }: LanguageNormsProps) {
  const queryClient = useQueryClient();
  const [sheet, setSheet] = useState<{
    row: NormRow | null;
    key: number;
    open: boolean;
  } | null>(null);
  const [resetting, setResetting] = useState(false);
  const languageName = LOCALE_NAME[language]();
  const source: Source | null = DEFAULT_NORMS[language].length
    ? { name: m.readingNormsSource(), rows: DEFAULT_NORMS[language] }
    : null;
  const shown = filled(rows);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: readingNormsQuery.queryKey });
  const write = async (next: NormRow[]) => {
    await saveReadingNorms({
      data: { language, rows: next, expectedVersion: version },
    });
    await refresh();
  };
  const reset = useMutation({
    mutationFn: () => resetReadingNorms({ data: { language } }),
    onSuccess: async () => {
      setResetting(false);
      toast.success(m.readingNormsReset());
      await refresh();
    },
    meta: { inlineError: true },
  });
  const openSheet = (row: NormRow | null) =>
    setSheet((current) => ({ row, key: (current?.key ?? 0) + 1, open: true }));
  const canAdd = GRADES.some(
    (value) =>
      value.meaning &&
      READING_SEASONS.some((season) => {
        const found = find(rows, value.meaning ?? "", season);
        return !found || blank(found);
      }),
  );
  const addButton = (variant: "default" | "outline") =>
    canAdd ? (
      <Button
        type="button"
        variant={variant}
        className="max-md:h-10"
        onClick={() => openSheet(null)}
      >
        <Plus aria-hidden />
        {m.readingNormAdd()}
      </Button>
    ) : undefined;
  const rowActions = (row: NormRow): RowAction[] => {
    const from = sourceRow(source, row);
    return [
      {
        label: m.recordEdit(),
        icon: Pencil,
        onSelect: () => openSheet(row),
      },
      ...(source && from && differs(from, row)
        ? [
            {
              label: m.readingNormsBackToSource(),
              icon: RotateCcw,
              confirm: {
                title: m.readingNormBackTitle({
                  source: source.name,
                  row: rowName(row),
                }),
                body: m.readingNormBackBody(),
                label: m.readingNormsBackToSource(),
              },
              onSelect: async () => {
                await write(withRow(rows, from));
                toast.success(m.readingNormBackDone());
              },
            },
          ]
        : []),
      ...(blank(row)
        ? []
        : [
            {
              label: m.readingNormRemove(),
              icon: Trash2,
              destructive: true as const,
              confirm: {
                title: m.readingNormRemoveTitle({ row: rowName(row) }),
                body: m.readingNormRemoveBody(),
                label: m.readingNormRemove(),
              },
              onSelect: async () => {
                await write(withRow(rows, empty(row.grade, row.season)));
                toast.success(m.readingNormRemoved());
              },
            },
          ]),
    ];
  };
  const opener: Opener = (row, text) => (
    <RowButton onClick={() => openSheet(row)}>{text}</RowButton>
  );
  return (
    <RecordSection
      variant="page"
      title={m.readingNormsFor({ language: languageName })}
      description={
        own
          ? m.readingNormsOwn()
          : language === "en"
            ? m.readingNormsDefaultEn()
            : m.readingNormsDefaultAr()
      }
      action={
        own ? (
          <Button
            type="button"
            variant="ghost"
            className="max-md:h-10"
            onClick={() => {
              reset.reset();
              setResetting(true);
            }}
          >
            <RotateCcw aria-hidden />
            {m.readingNormsResetAction()}
          </Button>
        ) : undefined
      }
    >
      <DataTable
        caption={m.readingNormsTable({ language: languageName })}
        rows={shown.map((row) => Object.assign({ id: rowKey(row) }, row))}
        columns={normColumns(source, opener)}
        rowLabel={rowName}
        rowActions={rowActions}
        actions={addButton("outline")}
        card={normCard(source, opener)}
        empty={{
          icon: BookOpenText,
          title: m.readingNormsEmpty(),
          action: addButton("default"),
        }}
      />
      {sheet ? (
        <NormSheet
          key={sheet.key}
          language={language}
          rows={rows}
          version={version}
          source={source}
          row={sheet.row}
          open={sheet.open}
          onClose={() =>
            setSheet((current) => current && { ...current, open: false })
          }
        />
      ) : null}
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
        error={reset.error ? getMessageFromError(reset.error) : undefined}
        onConfirm={() => reset.mutate()}
        onCancel={() => setResetting(false)}
      />
    </RecordSection>
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
    <div className="grid gap-10">
      {READING_LANGUAGES.map((language) => (
        <LanguageNorms
          key={`${language}-${norms[language].version}-${norms[language].own}`}
          language={language}
          {...norms[language]}
        />
      ))}
    </div>
  );
}
