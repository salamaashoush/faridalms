import { Link } from "@tanstack/react-router";

import type { curriculumMapQuery } from "~/queries/standards";

import { classTitle } from "~/components/classes/format";
import * as m from "~/i18n/messages";
import { formatDate, formatNumber } from "~/utils/datetime";

type MapData = Awaited<
  ReturnType<NonNullable<ReturnType<typeof curriculumMapQuery>["queryFn"]>>
>;
type Item = MapData["items"][number];
type Unit = MapData["units"][number];

/** The framework's items in reading order, each with how deep it sits and whether it heads others. */
function inOrder(items: readonly Item[]) {
  const children = new Map<string | null, Item[]>();
  for (const item of items) {
    const siblings = children.get(item.parentId) ?? [];
    siblings.push(item);
    children.set(item.parentId, siblings);
  }
  const known = new Set(items.map((item) => item.id));
  const out: { item: Item; depth: number; heads: boolean }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const item of children.get(parentId) ?? []) {
      const heads = (children.get(item.id)?.length ?? 0) > 0;
      out.push({ item, depth, heads });
      walk(item.id, depth + 1);
    }
  };
  walk(null, 0);
  // An item whose parent is gone still shows, at the top.
  for (const item of items)
    if (item.parentId && !known.has(item.parentId)) {
      out.push({ item, depth: 0, heads: false });
      walk(item.id, 1);
    }
  return out;
}

function ItemText({ item }: { item: Pick<Item, "code" | "statement"> }) {
  return (
    <span dir="auto" className="min-w-0">
      {item.code ? (
        <span className="font-mono text-[13px] font-medium text-muted-foreground">
          {item.code}{" "}
        </span>
      ) : null}
      {item.statement}
    </span>
  );
}

function UnitLink({ unit }: { unit: Unit }) {
  const classes = unit.classes.map((row) => classTitle(row)).join(", ");
  return (
    <Link
      to="/modules/$moduleId"
      params={{ moduleId: unit.id }}
      search={{}}
      className="inline-flex max-w-full items-baseline gap-1 rounded-md bg-muted px-2 py-0.5 text-[13px] leading-5 hover:bg-accent hover:text-accent-foreground"
    >
      <span dir="auto" className="truncate font-medium">
        {unit.title}
      </span>
      {classes ? (
        <span className="shrink-0 text-muted-foreground">{classes}</span>
      ) : null}
    </Link>
  );
}

/**
 * Each item of the framework with the units whose plans take it up, so a
 * coordinator sees which ideas the year returns to, which across which
 * classes, and which no unit takes up yet.
 */
export function ByItem({ map }: { map: MapData }) {
  const takenBy = new Map<string, Unit[]>();
  for (const unit of map.units)
    for (const item of unit.items)
      takenBy.set(item, [...(takenBy.get(item) ?? []), unit]);
  return (
    <ul className="grid divide-y rounded-lg border bg-card px-4">
      {inOrder(map.items).map(({ item, depth, heads }) => {
        const units = takenBy.get(item.id) ?? [];
        const indent = { paddingInlineStart: `${depth * 1.25}rem` };
        if (heads && units.length === 0)
          return (
            <li
              key={item.id}
              style={indent}
              className="pt-4 pb-1 text-[13px] leading-[18px] font-medium text-muted-foreground"
            >
              <ItemText item={item} />
            </li>
          );
        return (
          <li
            key={item.id}
            style={indent}
            className="grid gap-1.5 py-3 md:grid-cols-[minmax(12rem,20rem)_1fr] md:gap-4"
          >
            <div className="grid content-start gap-0.5 text-sm leading-5">
              <ItemText item={item} />
              <span
                className={
                  units.length
                    ? "text-[13px] leading-[18px] text-muted-foreground"
                    : "text-[13px] leading-[18px] text-warning-foreground dark:text-warning"
                }
              >
                {units.length
                  ? m.curriculumMapUnits({ count: units.length })
                  : m.curriculumMapNone()}
              </span>
            </div>
            {units.length ? (
              <div className="flex min-w-0 flex-wrap content-start gap-1.5">
                {units.map((unit) => (
                  <UnitLink key={unit.id} unit={unit} />
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Each unit of the year with the items of the framework its plan takes up. */
export function ByUnit({ map }: { map: MapData }) {
  const items = new Map(map.items.map((item) => [item.id, item]));
  return (
    <ul className="grid divide-y rounded-lg border bg-card px-4">
      {map.units.map((unit) => {
        const taken = unit.items.flatMap((id) => {
          const item = items.get(id);
          return item ? [item] : [];
        });
        return (
          <li
            key={unit.id}
            className="grid gap-1.5 py-3 md:grid-cols-[minmax(12rem,20rem)_1fr] md:gap-4"
          >
            <div className="grid content-start gap-0.5">
              <Link
                to="/modules/$moduleId"
                params={{ moduleId: unit.id }}
                search={{}}
                className="text-sm leading-5 font-medium hover:text-primary hover:underline"
              >
                <span dir="auto">{unit.title}</span>
              </Link>
              <span className="text-[13px] leading-[18px] text-muted-foreground">
                {[
                  unit.classes.map((row) => classTitle(row)).join(", "),
                  unit.startsOn ? formatDate(unit.startsOn) : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
            {taken.length ? (
              <ul className="flex min-w-0 flex-wrap content-start gap-1.5">
                {taken.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-md bg-muted px-2 py-0.5 text-[13px] leading-5"
                  >
                    <ItemText item={item} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] leading-5 text-muted-foreground">
                {m.curriculumMapUnitNone()}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** How much of the framework the year's units take up, as a line above the lists. */
export function MapSummary({ map }: { map: MapData }) {
  const leaves = inOrder(map.items).filter(({ heads }) => !heads);
  const taken = new Set(map.units.flatMap((unit) => unit.items));
  const covered = leaves.filter(({ item }) => taken.has(item.id)).length;
  return (
    <p className="text-sm leading-5 text-muted-foreground">
      {m.curriculumMapSummary({
        covered: formatNumber(covered),
        total: formatNumber(leaves.length),
        units: formatNumber(map.units.length),
      })}
    </p>
  );
}
