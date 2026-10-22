import type { ChartData, ChartKind } from "@faridalms/domain/content";
import type { SerializedDecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode";
import type {
  DOMExportOutput,
  EditorConfig,
  ElementFormatType,
  LexicalEditor,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  Spread,
} from "lexical";
import type { ClipboardEvent, JSX } from "react";

import {
  chartKinds,
  MAX_CHART_LABELS,
  MAX_CHART_SERIES,
} from "@faridalms/domain/content";
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { DecoratorBlockNode } from "@lexical/react/LexicalDecoratorBlockNode";
import { useLexicalEditable } from "@lexical/react/useLexicalEditable";
import { $getDocument, $getNodeByKey } from "lexical";
import { Plus, X } from "lucide-react";

import { gridOf, pasteIntoChart } from "../chart-paste";
import { ChartView } from "../chart-view";
import { useEditorEnvironment } from "../context";
import { ownKeys, useSelectOnClick } from "./select";

export type SerializedChartNode = Spread<
  { chart: ChartData },
  SerializedDecoratorBlockNode
>;

const blockClass = {
  base: "relative my-3",
  focus:
    "[&>*]:rounded-lg [&>*]:outline-2 [&>*]:outline-offset-2 [&>*]:outline-ring",
};

const fieldClass =
  "w-full min-w-0 rounded-md border bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/30";
const iconClass =
  "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-3.5";

const parse = (text: string) => {
  const value = Number(text.replace(",", "."));
  return text.trim() === "" || !Number.isFinite(value) ? null : value;
};

/**
 * A chart's numbers as its teacher keeps them: a small table of categories
 * down the side and series across, with the chart drawn beneath as it will
 * read.
 */
function ChartEditor({
  chart,
  onChange,
}: {
  chart: ChartData;
  onChange: (chart: ChartData) => void;
}) {
  const { strings, locale } = useEditorEnvironment();
  const pie = chart.kind === "pie";
  const series = (pie ? chart.series.slice(0, 1) : chart.series).map(
    (item, index) => ({
      name: item.name,
      values: item.values,
      key: `series-${index}`,
      index,
    }),
  );
  const rows = chart.labels.map((label, index) => ({
    label,
    key: `row-${index}`,
    index,
  }));
  const kinds: Record<ChartKind, string> = {
    bar: strings.chartKindBar,
    line: strings.chartKindLine,
    pie: strings.chartKindPie,
  };
  const setValue = (row: number, column: number, value: number | null) =>
    onChange({
      ...chart,
      series: chart.series.map((item, index) =>
        index === column
          ? {
              ...item,
              values: item.values.map((current, at) =>
                at === row ? value : current,
              ),
            }
          : item,
      ),
    });
  const pasteCells = (event: ClipboardEvent<HTMLTableElement>) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement) || !field.dataset.row) return;
    const grid = gridOf(event.clipboardData.getData("text/plain"));
    if (!grid) return;
    event.preventDefault();
    onChange(
      pasteIntoChart(chart, grid, {
        row: Number(field.dataset.row),
        column: Number(field.dataset.column),
      }),
    );
  };
  return (
    <div className="fe-chart-editor">
      <fieldset className="flex flex-wrap items-center gap-1">
        <legend className="sr-only">{strings.chart}</legend>
        {chartKinds.map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={chart.kind === kind}
            onClick={() => onChange({ ...chart, kind })}
            className="h-7 rounded-md px-2.5 text-xs font-medium text-foreground/80 hover:bg-accent aria-pressed:bg-accent aria-pressed:text-foreground"
          >
            {kinds[kind]}
          </button>
        ))}
      </fieldset>
      <input
        aria-label={strings.chartTitle}
        placeholder={strings.chartTitle}
        value={chart.title}
        maxLength={200}
        dir="auto"
        onChange={(event) => onChange({ ...chart, title: event.target.value })}
        className={fieldClass}
      />
      {pie ? null : (
        <div className="grid grid-cols-2 gap-2">
          <input
            aria-label={strings.chartXTitle}
            placeholder={strings.chartXTitle}
            value={chart.xTitle}
            maxLength={80}
            dir="auto"
            onChange={(event) =>
              onChange({ ...chart, xTitle: event.target.value })
            }
            className={fieldClass}
          />
          <input
            aria-label={strings.chartYTitle}
            placeholder={strings.chartYTitle}
            value={chart.yTitle}
            maxLength={80}
            dir="auto"
            onChange={(event) =>
              onChange({ ...chart, yTitle: event.target.value })
            }
            className={fieldClass}
          />
        </div>
      )}
      <div className="fe-chart-grid-edit">
        <table onPaste={pasteCells}>
          <thead>
            <tr>
              <th
                scope="col"
                className="text-start text-xs font-medium text-muted-foreground"
              >
                {strings.chartLabel}
              </th>
              {series.map((item) => (
                <th key={item.key} scope="col">
                  <span className="flex items-center gap-1">
                    <input
                      data-row={0}
                      data-column={item.index + 1}
                      aria-label={`${strings.chartSeriesName} ${item.index + 1}`}
                      placeholder={`${strings.chartSeriesName} ${item.index + 1}`}
                      value={item.name}
                      maxLength={60}
                      dir="auto"
                      onChange={(event) =>
                        onChange({
                          ...chart,
                          series: chart.series.map((current, at) =>
                            at === item.index
                              ? { ...current, name: event.target.value }
                              : current,
                          ),
                        })
                      }
                      className={fieldClass}
                    />
                    {series.length > 1 ? (
                      <button
                        type="button"
                        aria-label={strings.chartRemoveSeries(item.index + 1)}
                        onClick={() =>
                          onChange({
                            ...chart,
                            series: chart.series.filter(
                              (_, at) => at !== item.index,
                            ),
                          })
                        }
                        className={iconClass}
                      >
                        <X aria-hidden />
                      </button>
                    ) : null}
                  </span>
                </th>
              ))}
              <th aria-hidden />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">
                  <input
                    data-row={row.index + 1}
                    data-column={0}
                    aria-label={`${strings.chartLabel} ${row.index + 1}`}
                    placeholder={`${strings.chartLabel} ${row.index + 1}`}
                    value={row.label}
                    maxLength={60}
                    dir="auto"
                    onChange={(event) =>
                      onChange({
                        ...chart,
                        labels: chart.labels.map((current, at) =>
                          at === row.index ? event.target.value : current,
                        ),
                      })
                    }
                    className={fieldClass}
                  />
                </th>
                {series.map((item) => (
                  <td key={item.key}>
                    <input
                      data-row={row.index + 1}
                      data-column={item.index + 1}
                      type="number"
                      inputMode="decimal"
                      step="any"
                      aria-label={strings.chartValue(
                        row.label || `${strings.chartLabel} ${row.index + 1}`,
                        item.name ||
                          `${strings.chartSeriesName} ${item.index + 1}`,
                      )}
                      value={item.values[row.index] ?? ""}
                      onChange={(event) =>
                        setValue(
                          row.index,
                          item.index,
                          parse(event.target.value),
                        )
                      }
                      className={`${fieldClass} tabular-nums`}
                    />
                  </td>
                ))}
                <td>
                  {rows.length > 1 ? (
                    <button
                      type="button"
                      aria-label={strings.chartRemoveRow(row.index + 1)}
                      onClick={() =>
                        onChange({
                          ...chart,
                          labels: chart.labels.filter(
                            (_, at) => at !== row.index,
                          ),
                          series: chart.series.map((item) => ({
                            ...item,
                            values: item.values.filter(
                              (_, at) => at !== row.index,
                            ),
                          })),
                        })
                      }
                      className={iconClass}
                    >
                      <X aria-hidden />
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-1">
        {chart.labels.length < MAX_CHART_LABELS ? (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...chart,
                labels: [...chart.labels, ""],
                series: chart.series.map((item) => ({
                  ...item,
                  values: [...item.values, null],
                })),
              })
            }
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground/80 hover:bg-accent [&_svg]:size-3.5"
          >
            <Plus aria-hidden />
            {strings.chartAddRow}
          </button>
        ) : null}
        {!pie && chart.series.length < MAX_CHART_SERIES ? (
          <button
            type="button"
            onClick={() =>
              onChange({
                ...chart,
                series: [
                  ...chart.series,
                  { name: "", values: chart.labels.map(() => null) },
                ],
              })
            }
            className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-foreground/80 hover:bg-accent [&_svg]:size-3.5"
          >
            <Plus aria-hidden />
            {strings.chartAddSeries}
          </button>
        ) : null}
        <p className="ms-auto self-center text-xs text-muted-foreground">
          {strings.chartPasteHint}
        </p>
      </div>
      <ChartView chart={chart} strings={strings} locale={locale} />
    </div>
  );
}

function ChartBlock({
  nodeKey,
  format,
  chart,
}: {
  nodeKey: NodeKey;
  format: ElementFormatType;
  chart: ChartData;
}) {
  const [editor] = useLexicalComposerContext();
  const { strings, locale } = useEditorEnvironment();
  const editable = useLexicalEditable();
  const selected = useSelectOnClick(nodeKey);
  const change = (next: ChartData) =>
    editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if ($isChartNode(node)) node.setChart(next);
      },
      { discrete: true },
    );
  return (
    <BlockWithAlignableContents
      className={blockClass}
      format={format}
      nodeKey={nodeKey}
    >
      <div ref={ownKeys}>
        {editable && selected ? (
          <ChartEditor chart={chart} onChange={change} />
        ) : (
          <ChartView chart={chart} strings={strings} locale={locale} />
        )}
      </div>
    </BlockWithAlignableContents>
  );
}

const EMPTY_CHART: ChartData = {
  kind: "bar",
  title: "",
  xTitle: "",
  yTitle: "",
  labels: ["", "", ""],
  series: [{ name: "", values: [null, null, null] }],
};

/** Columns, lines or a pie drawn from a small table its teacher fills in. */
export class ChartNode extends DecoratorBlockNode {
  __chart: ChartData;

  constructor(
    chart: ChartData = EMPTY_CHART,
    format?: ElementFormatType,
    key?: NodeKey,
  ) {
    super(format, key);
    this.__chart = chart;
  }

  $config() {
    return this.config("chart", { extends: DecoratorBlockNode });
  }

  static clone(node: ChartNode): ChartNode {
    return new ChartNode(node.__chart, node.__format, node.__key);
  }

  static importJSON(json: SerializedChartNode): ChartNode {
    return new ChartNode().updateFromJSON(json);
  }

  updateFromJSON(json: LexicalUpdateJSON<SerializedChartNode>): this {
    const node = super.updateFromJSON(json).getWritable();
    node.__chart = json.chart;
    return node;
  }

  exportJSON(): SerializedChartNode {
    return { ...super.exportJSON(), chart: this.getLatest().__chart };
  }

  exportDOM(): DOMExportOutput {
    return { element: $getDocument().createElement("figure") };
  }

  getTextContent(): string {
    const chart = this.getLatest().__chart;
    return [chart.title, chart.labels.join(", ")]
      .filter((part) => part.trim())
      .join("\n");
  }

  getChart(): ChartData {
    return this.getLatest().__chart;
  }

  setChart(chart: ChartData): this {
    const writable = this.getWritable();
    writable.__chart = chart;
    return writable;
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): JSX.Element {
    return (
      <ChartBlock
        nodeKey={this.getKey()}
        format={this.__format}
        chart={this.__chart}
      />
    );
  }
}

export function $createChartNode(): ChartNode {
  return new ChartNode();
}

export function $isChartNode(
  node: LexicalNode | null | undefined,
): node is ChartNode {
  return node instanceof ChartNode;
}
