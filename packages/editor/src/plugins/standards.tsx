import type { KeyboardEvent } from "react";

import { MAX_QUESTION_STANDARDS } from "@faridalms/domain/standards";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { EditorStandards, StandardRef } from "../context";

import { useEditorEnvironment } from "../context";
import { ToolButton } from "../ui";

const field =
  "h-8 w-full min-w-0 rounded-md border bg-background ps-7 pe-2 text-sm outline-none [unicode-bidi:plaintext] focus-visible:ring-2 focus-visible:ring-ring/30 max-md:h-10";

const NO_REFS: StandardRef[] = [];

function withRows(
  known: ReadonlyMap<string, StandardRef>,
  rows: readonly StandardRef[],
): ReadonlyMap<string, StandardRef> {
  const next = new Map(known);
  for (const row of rows) next.set(row.id, row);
  return next;
}

function Statement({ standard }: { standard: StandardRef }) {
  return (
    <span className="line-clamp-2 min-w-0 text-sm leading-5" dir="auto">
      {standard.code ? (
        <>
          <span className="font-mono text-xs font-medium text-muted-foreground">
            {standard.code}
          </span>{" "}
        </>
      ) : null}
      {standard.statement}
    </span>
  );
}

/**
 * Tags a question with the school's standards: those it carries, then a
 * search over every framework. Nothing changes until Done, as with hints.
 */
export function StandardsPad({
  standards,
  chosen: initial,
  seen = NO_REFS,
  max = MAX_QUESTION_STANDARDS,
  onDone,
  onClose,
}: {
  standards: EditorStandards;
  chosen: readonly string[];
  /** What is already known of the chosen ones, shown until they are read afresh. */
  seen?: readonly StandardRef[];
  max?: number;
  /** The chosen ids, kept whether or not they could be read, and what is known of each. */
  onDone: (ids: string[], refs: StandardRef[]) => void;
  onClose: () => void;
}) {
  const { strings } = useEditorEnvironment();
  const [chosen, setChosen] = useState(() => [...initial]);
  const [known, setKnown] = useState<ReadonlyMap<string, StandardRef>>(() =>
    withRows(new Map(), seen),
  );
  const [described, setDescribed] = useState(initial.length === 0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StandardRef[] | null>(null);
  const [failed, setFailed] = useState(false);
  const full = chosen.length >= max;
  const searchField = useRef<HTMLInputElement>(null);
  useEffect(() => searchField.current?.focus(), []);

  const [first] = useState(initial);
  useEffect(() => {
    if (first.length === 0) return undefined;
    let current = true;
    standards.describe([...first]).then(
      (rows) => {
        if (!current) return;
        setKnown((before) => withRows(before, rows));
        setDescribed(true);
      },
      () => {
        if (current) setFailed(true);
      },
    );
    return () => {
      current = false;
    };
  }, [first, standards]);

  useEffect(() => {
    let current = true;
    const timer = setTimeout(
      () => {
        void standards.search(query.trim()).then(
          (rows) => {
            if (!current) return;
            setResults(rows);
            setFailed(false);
          },
          () => {
            if (current) setFailed(true);
          },
        );
      },
      query ? 200 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, standards]);

  const add = (row: StandardRef) => {
    if (full || chosen.includes(row.id)) return;
    setKnown((before) => withRows(before, [row]));
    setChosen([...chosen, row.id]);
  };
  const offered = (results ?? []).filter((row) => !chosen.includes(row.id));
  const escape = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    onClose();
  };

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onDone(
          chosen,
          chosen.flatMap((id) => {
            const found = known.get(id);
            return found ? [found] : [];
          }),
        );
      }}
    >
      <div className="grid gap-0.5">
        <p className="text-xs font-medium text-muted-foreground">
          {strings.questionStandards}
        </p>
        <p className="text-xs leading-4 text-muted-foreground">
          {strings.questionStandardsHelp}
        </p>
      </div>
      {chosen.length > 0 ? (
        <ul
          aria-label={strings.questionStandardsChosen}
          aria-busy={!described}
          className="grid gap-1"
        >
          {chosen.map((id) => {
            const standard = known.get(id);
            const name = standard
              ? standard.code || standard.statement
              : strings.questionStandardsGone;
            return (
              <li
                key={id}
                className="flex items-start gap-1 rounded-md bg-muted/60 py-1 ps-2"
              >
                <span className="min-w-0 flex-1 pt-1.5">
                  {standard ? (
                    <Statement standard={standard} />
                  ) : (
                    <span className="text-sm leading-5 text-muted-foreground">
                      {described ? strings.questionStandardsGone : "…"}
                    </span>
                  )}
                </span>
                <ToolButton
                  label={strings.questionStandardsRemove(name)}
                  onClick={() =>
                    setChosen(chosen.filter((item) => item !== id))
                  }
                >
                  <X aria-hidden />
                </ToolButton>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute start-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          ref={searchField}
          type="search"
          autoComplete="off"
          spellCheck={false}
          aria-label={strings.questionStandardsSearch}
          placeholder={strings.questionStandardsSearch}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") escape(event);
            if (event.key !== "Enter") return;
            event.preventDefault();
            const top = offered[0];
            if (top) add(top);
          }}
          className={field}
        />
      </div>
      {failed ? (
        <p role="alert" className="text-xs leading-4 text-destructive">
          {strings.questionStandardsFailed}
        </p>
      ) : results === null ||
        (results.length > 0 && offered.length === 0) ? null : results.length ===
        0 ? (
        <p className="text-xs leading-4 text-muted-foreground">
          {query.trim()
            ? strings.questionStandardsNone
            : strings.questionStandardsEmpty}
        </p>
      ) : (
        <ul
          aria-label={strings.questionStandardsResults}
          className="-mx-1 grid max-h-60 overflow-y-auto"
        >
          {offered.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                disabled={full}
                onClick={() => add(row)}
                onKeyDown={escape}
                className="grid w-full gap-0.5 rounded-md px-2 py-1.5 text-start outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
              >
                <Statement standard={row} />
                <span
                  className="truncate text-xs leading-4 text-muted-foreground"
                  dir="auto"
                >
                  {row.frameworkTitle}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs leading-4 text-muted-foreground">
          {full ? strings.questionStandardsFull(max) : null}
        </p>
        <button
          type="submit"
          onKeyDown={escape}
          className="h-8 shrink-0 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {strings.questionDone}
        </button>
      </div>
    </form>
  );
}
