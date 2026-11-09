import type { FeedbackBand } from "@faridalms/domain/learning";
import type { GridColumn } from "@faridalms/ui/system/data-grid";

import { MAX_FEEDBACK_BANDS } from "@faridalms/domain/learning";
import {
  DataGrid,
  GridAddButton,
  GridRemoveButton,
  NumberCell,
  TextCell,
  useFocusAfterRender,
} from "@faridalms/ui/system/data-grid";
import { useId } from "react";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

interface BandGridOptions {
  bands: FeedbackBand[];
  change: (index: number, patch: Partial<FeedbackBand>) => void;
  remove: (index: number) => void;
}

// Built per render: headers read the request's locale.
function bandGrid({ bands, change, remove }: BandGridOptions) {
  const at = (band: FeedbackBand) => bands.indexOf(band);
  const rowHeader = {
    header: m.bandsFromHeader(),
    cell: (band: FeedbackBand) => (
      <NumberCell
        id={`band-${band.id}-from`}
        label={m.bandsFromOf({ number: formatNumber(at(band) + 1) })}
        value={band.from}
        onChange={(from) =>
          change(at(band), { from: Math.min(100, Math.max(0, from ?? 0)) })
        }
      />
    ),
  };
  const columns: GridColumn<FeedbackBand>[] = [
    {
      id: "text",
      header: m.bandsMessageHeader(),
      fill: true,
      cell: (band) => (
        <TextCell
          id={`band-${band.id}-text`}
          label={m.bandsText({ from: band.from })}
          placeholder={m.bandsPlaceholder()}
          maxLength={500}
          value={band.text}
          onChange={(text) => change(at(band), { text })}
        />
      ),
    },
  ];
  const rowEnd = (band: FeedbackBand) => (
    <GridRemoveButton
      label={m.bandsRemove({ from: band.from })}
      onRemove={() => remove(at(band))}
    />
  );
  return { rowHeader, columns, rowEnd };
}

export interface FeedbackBandsProps {
  bands: FeedbackBand[];
  onChange: (bands: FeedbackBand[]) => void;
  /** When the student reads the message, and what the score counts. */
  hint?: string;
}

/**
 * Messages a scored lesson, quiz or mixed review gives by score, each for a
 * score from its own up to the next: a few words of encouragement, or
 * where to look again, as Moodle's overall feedback does.
 */
export function FeedbackBands({
  bands,
  onChange,
  hint = m.bandsHint(),
}: FeedbackBandsProps) {
  const id = useId();
  const focusLater = useFocusAfterRender();
  const change = (index: number, patch: Partial<FeedbackBand>) =>
    onChange(
      bands.map((band, at) => (at === index ? { ...band, ...patch } : band)),
    );
  const add =
    bands.length < MAX_FEEDBACK_BANDS ? (
      <GridAddButton
        label={m.bandsAdd()}
        onAdd={() => {
          const added = {
            id: crypto.randomUUID(),
            from: bands.length === 0 ? 80 : 0,
            text: "",
          };
          onChange([...bands, added]);
          focusLater(`band-${added.id}-text`);
        }}
      />
    ) : null;
  return (
    <fieldset className="grid min-w-0 gap-2" aria-describedby={`${id}-hint`}>
      <legend className="text-sm leading-5 font-medium">
        {m.bandsTitle()}
      </legend>
      <p
        id={`${id}-hint`}
        className="text-[13px] leading-[18px] text-muted-foreground"
      >
        {hint}
      </p>
      {bands.length ? (
        <DataGrid<FeedbackBand>
          caption={m.bandsTitle()}
          editing
          surface="page"
          {...bandGrid({
            bands,
            change,
            remove: (index) => onChange(bands.filter((_, at) => at !== index)),
          })}
          groups={[{ id: "bands", title: "", rows: bands }]}
          rowKey={(band) => band.id}
          footer={add}
        />
      ) : (
        <div>{add}</div>
      )}
      {new Set(bands.map((band) => band.from)).size < bands.length ? (
        <p className="text-[13px] leading-[18px] text-destructive">
          {m.bandsTwice()}
        </p>
      ) : null}
    </fieldset>
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
