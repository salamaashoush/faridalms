import { MAX_QUESTION_STANDARDS } from "@faridalms/domain/standards";
import { Button } from "@faridalms/ui/button";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useState } from "react";

import { ComboboxField } from "~/components/system/ComboboxField";
import * as m from "~/i18n/messages";
import { describeStandards, searchStandards } from "~/server/standards";

type Known = { code: string; statement: string };

const labelOf = (standard: Known) =>
  standard.code ? `${standard.code} ${standard.statement}` : standard.statement;

/**
 * The school's standards something counts toward: those chosen, each with
 * its code and statement, then a search over every framework to add more.
 */
export function StandardsField({
  label,
  hint,
  value,
  onChange,
  max = MAX_QUESTION_STANDARDS,
}: {
  label: string;
  hint?: string;
  value: readonly string[];
  onChange: (value: string[]) => void;
  max?: number;
}) {
  const [search, setSearch] = useState("");
  const [first] = useState(value);
  const [picked, setPicked] = useState<ReadonlyMap<string, Known>>(
    () => new Map(),
  );
  const described = useQuery({
    queryKey: ["standards", "describe", first],
    queryFn: () => describeStandards({ data: { ids: [...first] } }),
    enabled: first.length > 0,
    staleTime: 60_000,
  });
  const found = useQuery({
    queryKey: ["standards", "search", search],
    queryFn: () => searchStandards({ data: { query: search } }),
    staleTime: 30_000,
  });
  const known = new Map<string, Known>([
    ...(described.data ?? []).map((row) => [row.id, row] as const),
    ...picked,
  ]);
  const offered = (found.data ?? []).filter((row) => !value.includes(row.id));
  const full = value.length >= max;
  return (
    <div className="grid gap-2">
      <ComboboxField
        label={label}
        hint={hint}
        optional
        emptyLabel={
          full ? m.standardsFieldFull({ count: max }) : m.standardsFieldAdd()
        }
        options={
          full
            ? []
            : offered.map((row) => ({ value: row.id, label: labelOf(row) }))
        }
        value={[]}
        onChange={([chosen]) => {
          const row = offered.find((item) => item.id === chosen);
          if (!row || full) return;
          setPicked(new Map([...picked, [row.id, row]]));
          onChange([...value, row.id]);
        }}
        search={search}
        onSearchChange={setSearch}
      />
      {value.length > 0 ? (
        <ul aria-label={label} className="grid gap-1">
          {value.map((id) => {
            const standard = known.get(id);
            const name = standard
              ? standard.code || standard.statement
              : m.standardsFieldUnknown();
            return (
              <li
                key={id}
                className="flex items-start gap-1 rounded-md bg-muted/60 py-1 ps-2"
              >
                <span
                  dir="auto"
                  className="line-clamp-2 min-w-0 flex-1 pt-1.5 text-sm leading-5"
                >
                  {standard ? (
                    <>
                      {standard.code ? (
                        <span className="font-mono text-xs font-medium text-muted-foreground">
                          {standard.code}
                        </span>
                      ) : null}{" "}
                      {standard.statement}
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {described.isPending ? "…" : m.standardsFieldUnknown()}
                    </span>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="max-md:size-10"
                  aria-label={m.standardsFieldRemove({ name })}
                  onClick={() => onChange(value.filter((item) => item !== id))}
                >
                  <X aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
