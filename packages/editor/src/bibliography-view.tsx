import type { Bibliography } from "@faridalms/domain/bibliography";
import type { CitationStyle } from "@faridalms/domain/citations";

import { Fragment } from "react";

import { linked } from "./linked";

export interface BibliographyViewStrings {
  referencesApa: string;
  referencesMla: string;
  referencesChicago: string;
}

const TITLE: Record<CitationStyle, keyof BibliographyViewStrings> = {
  apa: "referencesApa",
  mla: "referencesMla",
  chicago: "referencesChicago",
};

/**
 * A document's reference list under the name its style gives one, each
 * source hanging from its first line as reference lists are set.
 */
export function BibliographyList({
  bibliography,
  strings,
  level = 2,
}: {
  bibliography: Bibliography;
  strings: BibliographyViewStrings;
  level?: number;
}) {
  const Heading = `h${Math.min(6, Math.max(2, level))}` as
    | "h2"
    | "h3"
    | "h4"
    | "h5"
    | "h6";
  return (
    <>
      <Heading className="fe-h2">{strings[TITLE[bibliography.style]]}</Heading>
      <ul className="fe-bibliography">
        {bibliography.entries.map((runs) => (
          <li key={runs.map((run) => run.text).join("")} dir="auto">
            {runs.map((run, at) => {
              // Where the run starts in the entry, which no other run shares.
              const offset = runs
                .slice(0, at)
                .reduce((sum, previous) => sum + previous.text.length, 0);
              return run.italic ? (
                <i key={offset}>{run.text}</i>
              ) : (
                <Fragment key={offset}>
                  {linked(run.text, String(offset))}
                </Fragment>
              );
            })}
          </li>
        ))}
      </ul>
    </>
  );
}
