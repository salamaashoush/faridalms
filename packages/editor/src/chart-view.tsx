import type { ChartData } from "@faridalms/domain/content";
import type { PointerEvent, ReactNode } from "react";

import { MAX_PIE_SLICES } from "@faridalms/domain/content";
import { useEffect, useRef, useState } from "react";

export interface ChartStrings {
  chartData: string;
  chartSeries: string;
  chartCategory: string;
  chartOther: string;
  chartEmpty: string;
}

const HEIGHT = 240;
const AXIS_BAND = 28;
const BAR = 24;
const GAP = 2;
const RADIUS = 4;

/** Ticks at round steps of 1, 2 or 5, about five of them, always taking in zero. */
export function niceTicks(low: number, high: number): number[] {
  const from = Math.min(0, low);
  const to = Math.max(0, high, from + 1);
  const rough = (to - from) / 5;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 5, 10]
      .map((factor) => factor * power)
      .find((size) => size >= rough) ?? power * 10;
  const first = Math.floor(from / step);
  const last = Math.ceil(to / step);
  return Array.from(
    { length: last - first + 1 },
    (_, at) => Math.round((first + at) * step * 1e9) / 1e9,
  );
}

/** A bar from the baseline, its data end rounded and its base square. */
function barPath(x: number, width: number, base: number, end: number) {
  const length = Math.abs(end - base);
  if (length === 0) return "";
  const r = Math.min(RADIUS, width / 2, length);
  const toward = end < base ? 1 : -1;
  return `M${x},${base}V${end + toward * r}Q${x},${end} ${x + r},${end}H${x + width - r}Q${x + width},${end} ${x + width},${end + toward * r}V${base}Z`;
}

/** The width the chart has, followed as its column narrows or widens. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

interface Slice {
  key: string;
  label: string;
  value: number;
  start: number;
  end: number;
}

/** A pie's slices, the first few and the rest folded into one, with their angles. */
function slicesOf(
  chart: ChartData,
  label: (index: number) => string,
  other: string,
) {
  const values = chart.labels.map((_, index) => ({
    label: label(index),
    value: Math.max(0, chart.series[0]?.values[index] ?? 0),
  }));
  const folded =
    values.length <= MAX_PIE_SLICES
      ? values
      : [
          ...values.slice(0, MAX_PIE_SLICES - 1),
          {
            label: other,
            value: values
              .slice(MAX_PIE_SLICES - 1)
              .reduce((sum, item) => sum + item.value, 0),
          },
        ];
  const total = folded.reduce((sum, item) => sum + item.value, 0);
  const slices: Slice[] = [];
  let start = -Math.PI / 2;
  for (const [index, item] of folded.entries()) {
    const end = start + (total ? (item.value / total) * Math.PI * 2 : 0);
    slices.push({
      key: `slice-${index}`,
      label: item.label,
      value: item.value,
      start,
      end,
    });
    start = end;
  }
  return slices;
}

/** A line's unbroken runs as paths: a missing value breaks it. */
function runsOf(points: ({ x: number; y: number } | null)[]) {
  const runs: string[] = [];
  let run = "";
  for (const point of points) {
    if (!point) {
      if (run) runs.push(run);
      run = "";
      continue;
    }
    run += `${run ? "L" : "M"}${point.x},${point.y}`;
  }
  if (run) runs.push(run);
  return runs;
}

function slicePath(slice: Slice, c: number, r: number) {
  const sweep = slice.end - slice.start;
  if (sweep >= Math.PI * 2 - 1e-6)
    return `M${c},${c - r}A${r},${r} 0 1 1 ${c - 0.01},${c - r}Z`;
  const large = sweep > Math.PI ? 1 : 0;
  return `M${c},${c}L${c + r * Math.cos(slice.start)},${c + r * Math.sin(slice.start)}A${r},${r} 0 ${large} 1 ${c + r * Math.cos(slice.end)},${c + r * Math.sin(slice.end)}Z`;
}

const colour = (index: number) => `var(--fe-series-${index + 1})`;

/**
 * A chart as its reader meets it: columns, lines or a pie drawn to the
 * column's width, a legend whenever more than one colour is in it, and the
 * numbers themselves in a table beneath. To the keyboard the chart is one
 * slider: the arrow keys move along the categories, and the readout names
 * every series' value there, as a pointer's hover does.
 */
export function ChartView({
  chart,
  strings,
  locale,
  printed = false,
}: {
  chart: ChartData;
  strings: ChartStrings;
  locale: string;
  printed?: boolean;
}) {
  const { ref, width } = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const numbers = new Intl.NumberFormat(`${locale}-u-nu-latn`);
  const compact = new Intl.NumberFormat(`${locale}-u-nu-latn`, {
    notation: "compact",
  });
  const pie = chart.kind === "pie";
  const label = (index: number) =>
    chart.labels[index] || `${strings.chartCategory} ${index + 1}`;
  // A chart's categories and series are its teacher's rows and columns,
  // known by their place.
  const categories = chart.labels.map((_, index) => ({
    key: `category-${index}`,
    label: label(index),
    index,
  }));
  const series = chart.series
    .slice(0, pie ? 1 : undefined)
    .map((item, index) => ({
      name: item.name,
      values: item.values,
      key: `series-${index}`,
      index,
    }));
  const slices = pie ? slicesOf(chart, label, strings.chartOther) : [];
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const count = pie ? slices.length : categories.length;
  const values = series.flatMap((item) =>
    item.values.filter((value): value is number => value !== null),
  );
  const empty = pie ? total === 0 : values.length === 0;
  const valueOf = (value: number | null | undefined) =>
    value === null || value === undefined ? "–" : numbers.format(value);
  const share = (value: number) =>
    `${numbers.format(Math.round((value / (total || 1)) * 100))}%`;

  const readoutText = (() => {
    if (active === null) return "";
    if (pie) {
      const slice = slices[active];
      return slice
        ? `${slice.label}: ${numbers.format(slice.value)}, ${share(slice.value)}`
        : "";
    }
    return `${label(active)}: ${series
      .map((item) =>
        series.length > 1
          ? `${item.name} ${valueOf(item.values[active])}`
          : valueOf(item.values[active]),
      )
      .join(", ")}`;
  })();

  const keys = pie
    ? slices.map((slice, index) => ({
        key: slice.key,
        name: slice.label,
        index,
      }))
    : series.map((item) => ({
        key: item.key,
        name: item.name || `${strings.chartSeries} ${item.index + 1}`,
        index: item.index,
      }));
  const legend =
    keys.length > 1 ? (
      <ul className="fe-chart-legend">
        {keys.map((item) => (
          <li key={item.key}>
            <span
              aria-hidden
              className="fe-chart-key"
              data-line={chart.kind === "line" ? "" : undefined}
              style={{ background: colour(item.index) }}
            />
            <span dir="auto">{item.name}</span>
            {pie ? (
              <span className="fe-chart-share">
                {share(slices[item.index]?.value ?? 0)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    ) : null;

  let drawing: ReactNode = null;
  let readout: ReactNode = null;
  if (!empty && pie) {
    const size = Math.min(width, HEIGHT);
    const c = size / 2;
    drawing = (
      <svg width={size} height={size} aria-hidden className="fe-chart-svg">
        {slices.map((slice, index) =>
          slice.value === 0 ? null : (
            <path
              key={slice.key}
              d={slicePath(slice, c, c - 4)}
              fill={colour(index)}
              className="fe-chart-slice"
              data-active={active === index ? "" : undefined}
              onPointerEnter={() => setActive(index)}
              onPointerLeave={() => setActive(null)}
            />
          ),
        )}
      </svg>
    );
    const slice = active === null ? null : slices[active];
    readout = slice ? (
      <>
        <span className="fe-chart-readout-label" dir="auto">
          {slice.label}
        </span>
        <span className="fe-chart-readout-row">
          <strong>{numbers.format(slice.value)}</strong>
          <span>{share(slice.value)}</span>
        </span>
      </>
    ) : null;
  } else if (!empty) {
    const ticks = niceTicks(Math.min(...values), Math.max(...values));
    const low = ticks[0] ?? 0;
    const high = ticks.at(-1) ?? 1;
    const left = 44 + (chart.yTitle ? 18 : 0);
    const right = 8;
    const inner = Math.max(60, width - left - right);
    const band = inner / count;
    const y = (value: number) =>
      8 + ((high - value) / (high - low || 1)) * (HEIGHT - 16);
    const x = (index: number) => left + band * index + band / 2;
    const every = Math.max(
      1,
      Math.ceil(count / Math.max(1, Math.floor(inner / 56))),
    );
    const per = Math.min(
      BAR,
      (Math.min(band * 0.75, series.length * BAR + (series.length - 1) * GAP) -
        (series.length - 1) * GAP) /
        series.length,
    );
    const group = per * series.length + GAP * (series.length - 1);
    drawing = (
      <svg
        width={width}
        height={HEIGHT + AXIS_BAND + (chart.xTitle ? 18 : 0)}
        aria-hidden
        className="fe-chart-svg"
        onPointerMove={(event: PointerEvent<SVGSVGElement>) => {
          const box = event.currentTarget.getBoundingClientRect();
          const index = Math.floor((event.clientX - box.left - left) / band);
          setActive(index >= 0 && index < count ? index : null);
        }}
        onPointerLeave={() => setActive(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={width - right}
              y1={y(tick)}
              y2={y(tick)}
              className={tick === 0 ? "fe-chart-baseline" : "fe-chart-grid"}
            />
            <text
              x={left - 8}
              y={y(tick)}
              dy="0.32em"
              textAnchor="end"
              className="fe-chart-tick"
            >
              {compact.format(tick)}
            </text>
          </g>
        ))}
        {chart.yTitle ? (
          <text
            transform={`translate(12 ${HEIGHT / 2}) rotate(-90)`}
            textAnchor="middle"
            className="fe-chart-axis-title"
          >
            {chart.yTitle}
          </text>
        ) : null}
        {active === null ? null : (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={8}
            y2={HEIGHT - 8}
            className="fe-chart-cross"
          />
        )}
        {chart.kind === "bar"
          ? series.map((item) => (
              <g key={item.key} fill={colour(item.index)}>
                {categories.map((category) => {
                  const value = item.values[category.index];
                  return value === null || value === undefined ? null : (
                    <path
                      key={category.key}
                      d={barPath(
                        x(category.index) -
                          group / 2 +
                          item.index * (per + GAP),
                        per,
                        y(0),
                        y(value),
                      )}
                      className="fe-chart-bar"
                      data-active={active === category.index ? "" : undefined}
                    />
                  );
                })}
              </g>
            ))
          : series.map((item) => {
              const runs = runsOf(
                categories.map((category) => {
                  const value = item.values[category.index];
                  return value === null || value === undefined
                    ? null
                    : { x: x(category.index), y: y(value) };
                }),
              );
              return (
                <g key={item.key}>
                  {runs.map((path) => (
                    <path
                      key={path}
                      d={path}
                      stroke={colour(item.index)}
                      className="fe-chart-line"
                    />
                  ))}
                  {categories.map((category) => {
                    const value = item.values[category.index];
                    return value === null || value === undefined ? null : (
                      <circle
                        key={category.key}
                        cx={x(category.index)}
                        cy={y(value)}
                        r={active === category.index ? 5 : 4}
                        fill={colour(item.index)}
                        className="fe-chart-dot"
                      />
                    );
                  })}
                </g>
              );
            })}
        {categories.map((category) =>
          category.index % every === 0 ? (
            <text
              key={category.key}
              x={x(category.index)}
              y={HEIGHT + 14}
              textAnchor="middle"
              className="fe-chart-tick"
              data-active={active === category.index ? "" : undefined}
            >
              {category.label.length > 14
                ? `${category.label.slice(0, 13)}…`
                : category.label}
            </text>
          ) : null,
        )}
        {chart.xTitle ? (
          <text
            x={left + inner / 2}
            y={HEIGHT + AXIS_BAND + 10}
            textAnchor="middle"
            className="fe-chart-axis-title"
          >
            {chart.xTitle}
          </text>
        ) : null}
      </svg>
    );
    readout =
      active === null ? null : (
        <>
          <span className="fe-chart-readout-label" dir="auto">
            {label(active)}
          </span>
          {series.map((item) => (
            <span key={item.key} className="fe-chart-readout-row">
              <span
                aria-hidden
                className="fe-chart-key"
                data-line=""
                style={{ background: colour(item.index) }}
              />
              <strong>{valueOf(item.values[active])}</strong>
              {series.length > 1 ? <span dir="auto">{item.name}</span> : null}
            </span>
          ))}
        </>
      );
  }

  return (
    <figure className="fe-chart">
      {chart.title ? (
        <figcaption className="fe-chart-title" dir="auto">
          {chart.title}
        </figcaption>
      ) : null}
      {legend}
      {empty ? (
        <p className="fe-chart-empty">{strings.chartEmpty}</p>
      ) : (
        <div ref={ref} className="fe-chart-plot" dir="ltr">
          {drawing}
          {printed ? null : (
            <input
              type="range"
              min={0}
              max={Math.max(0, count - 1)}
              step={1}
              value={active ?? 0}
              aria-label={chart.title || strings.chartData}
              aria-valuetext={readoutText || label(0)}
              className="fe-chart-range"
              onFocus={() => setActive((current) => current ?? 0)}
              onBlur={() => setActive(null)}
              onChange={(event) => setActive(Number(event.target.value))}
            />
          )}
          <div
            aria-hidden
            className="fe-chart-readout"
            data-shown={readout ? "" : undefined}
            data-side={active !== null && active >= count / 2 ? "start" : "end"}
          >
            {readout}
          </div>
        </div>
      )}
      <details className="fe-chart-data" open={printed || undefined}>
        <summary>{strings.chartData}</summary>
        <div className="fe-chart-table">
          <table>
            <thead>
              <tr>
                <th scope="col" dir="auto">
                  {chart.xTitle || strings.chartCategory}
                </th>
                {series.map((item) => (
                  <th key={item.key} scope="col" dir="auto">
                    {item.name || chart.yTitle || "–"}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.key}>
                  <th scope="row" dir="auto">
                    {category.label}
                  </th>
                  {series.map((item) => (
                    <td key={item.key}>
                      {valueOf(item.values[category.index])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
