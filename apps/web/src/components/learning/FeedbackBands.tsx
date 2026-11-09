import type { FeedbackBand } from "@faridalms/domain/learning";
import type {
  Column,
  DataTableLayout,
  RowAction,
} from "@faridalms/ui/system/data-table";
import type { ReactNode } from "react";

import { MAX_FEEDBACK_BANDS } from "@faridalms/domain/learning";
import { Button } from "@faridalms/ui/button";
import { DataTable, RowButton } from "@faridalms/ui/system/data-table";
import { FormField, NumberField } from "@faridalms/ui/system/form-field";
import { SheetForm } from "@faridalms/ui/system/sheet-form";
import { Textarea } from "@faridalms/ui/textarea";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

/** The scores a message covers: from its own up to the next one's. */
function scoresOf(bands: readonly FeedbackBand[], band: FeedbackBand) {
  const next = bands
    .flatMap((other) => (other.from > band.from ? [other.from] : []))
    .toSorted((a, b) => a - b)[0];
  return next === undefined
    ? m.bandsScoresTop({ from: formatNumber(band.from) })
    : m.bandsScores({ from: formatNumber(band.from), to: formatNumber(next) });
}

type BandOpener = (band: FeedbackBand) => ReactNode;

// Built per render: headers read the request's locale.
function bandColumns(opener: BandOpener): Column<FeedbackBand>[] {
  return [
    {
      id: "scores",
      header: m.bandsScoresHeader(),
      primary: true,
      cell: opener,
    },
    {
      id: "text",
      header: m.bandsMessageHeader(),
      width: "wide",
      cell: (band) => <span dir="auto">{band.text}</span>,
    },
  ];
}

function bandCard(opener: BandOpener) {
  return {
    title: opener,
    fact: (band: FeedbackBand) => <span dir="auto">{band.text}</span>,
  };
}

interface BandSheetProps {
  bands: FeedbackBand[];
  /** The message being changed; none to add one. */
  band: FeedbackBand | null;
  open: boolean;
  onDone: (bands: FeedbackBand[]) => void;
  onClose: () => void;
}

/** One message and the score it starts at, kept with what it belongs to. */
function BandSheet({ bands, band, open, onDone, onClose }: BandSheetProps) {
  const others = bands.filter((other) => other.id !== band?.id);
  const free = (from: number) => !others.some((other) => other.from === from);
  const [from, setFrom] = useState<number | null>(
    () => band?.from ?? [80, 0].find(free) ?? null,
  );
  const [text, setText] = useState(band?.text ?? "");
  const [tried, setTried] = useState(false);
  const fromProblem =
    from === null || from > 100
      ? m.bandsFromNeeded()
      : free(from)
        ? null
        : m.bandsFromTaken();
  const textProblem = text.trim() ? null : m.bandsTextNeeded();
  const next: FeedbackBand = {
    id: band?.id ?? crypto.randomUUID(),
    from: from ?? 0,
    text,
  };
  return (
    <SheetForm
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
      title={
        band ? m.bandsEdit({ from: formatNumber(band.from) }) : m.bandsAdd()
      }
      submitLabel={band ? m.bandsSave() : m.bandsAdd()}
      onSubmit={() => {
        setTried(true);
        if (fromProblem || textProblem) return;
        onDone(
          band
            ? bands.map((other) => (other.id === band.id ? next : other))
            : [...bands, next],
        );
        onClose();
      }}
    >
      <NumberField
        id="band-from"
        label={m.bandsFromHeader()}
        hint={
          from === null || fromProblem
            ? undefined
            : scoresOf([...others, next], next)
        }
        value={from}
        onChange={setFrom}
        errors={tried && fromProblem ? [fromProblem] : undefined}
      />
      <FormField
        id="band-text"
        label={m.bandsMessageHeader()}
        errors={tried && textProblem ? [textProblem] : undefined}
      >
        {(control) => (
          <Textarea
            {...control}
            dir="auto"
            rows={4}
            maxLength={500}
            placeholder={m.bandsPlaceholder()}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        )}
      </FormField>
    </SheetForm>
  );
}

export interface FeedbackBandsProps {
  bands: FeedbackBand[];
  onChange: (bands: FeedbackBand[]) => void;
  /** When the student reads the message, and what the score counts. */
  hint?: string;
  /** `cards` in a column too narrow for the table, such as an editor's panel. */
  layout?: DataTableLayout;
}

/**
 * Messages a scored lesson, quiz or mixed review gives by score, each for a
 * score from its own up to the next: a few words of encouragement, or
 * where to look again, as Moodle's overall feedback does. Each message is
 * a row opened in its own sheet and kept with what it belongs to.
 */
export function FeedbackBands({
  bands,
  onChange,
  hint = m.bandsHint(),
  layout,
}: FeedbackBandsProps) {
  const id = useId();
  const [sheet, setSheet] = useState<{
    band: FeedbackBand | null;
    key: number;
    open: boolean;
  } | null>(null);
  const open = (band: FeedbackBand | null) =>
    setSheet((current) => ({ band, key: (current?.key ?? 0) + 1, open: true }));
  const opener: BandOpener = (band) => (
    <RowButton onClick={() => open(band)}>{scoresOf(bands, band)}</RowButton>
  );
  const add =
    bands.length < MAX_FEEDBACK_BANDS ? (
      <Button
        type="button"
        variant="outline"
        className="max-md:h-10"
        onClick={() => open(null)}
      >
        <Plus aria-hidden />
        {m.bandsAdd()}
      </Button>
    ) : undefined;
  const rowActions = (band: FeedbackBand): RowAction[] => [
    { label: m.recordEdit(), icon: Pencil, onSelect: () => open(band) },
    {
      label: m.bandsRemoveAction(),
      icon: Trash2,
      destructive: true,
      confirm: {
        title: m.bandsRemoveTitle({ from: formatNumber(band.from) }),
        body: m.bandsRemoveBody(),
        label: m.bandsRemoveAction(),
      },
      onSelect: () => onChange(bands.filter((other) => other.id !== band.id)),
    },
  ];
  return (
    <section
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-hint`}
      className="grid min-w-0 gap-2"
    >
      <h3 id={`${id}-title`} className="text-sm leading-5 font-medium">
        {m.bandsTitle()}
      </h3>
      <p
        id={`${id}-hint`}
        className="text-[13px] leading-[18px] text-muted-foreground"
      >
        {hint}
      </p>
      <DataTable
        caption={m.bandsTitle()}
        layout={layout}
        rows={bands.toSorted((a, b) => b.from - a.from)}
        columns={bandColumns(opener)}
        rowLabel={(band) => scoresOf(bands, band)}
        rowActions={rowActions}
        actions={add}
        card={bandCard(opener)}
        empty={{ title: m.bandsNone(), action: add }}
      />
      {new Set(bands.map((band) => band.from)).size < bands.length ? (
        <p className="text-[13px] leading-[18px] text-destructive">
          {m.bandsTwice()}
        </p>
      ) : null}
      {sheet ? (
        <BandSheet
          key={sheet.key}
          bands={bands}
          band={sheet.band}
          open={sheet.open}
          onDone={onChange}
          onClose={() =>
            setSheet((current) => current && { ...current, open: false })
          }
        />
      ) : null}
    </section>
  );
}

/** The messages as they are kept: those written, the first for each score. */
export function keptBands(bands: readonly FeedbackBand[]): FeedbackBand[] {
  const seen = new Set<number>();
  return bands.flatMap((band) => {
    const text = band.text.trim();
    if (!text || seen.has(band.from)) return [];
    seen.add(band.from);
    return [{ ...band, text }];
  });
}
