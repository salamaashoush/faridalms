import type { GlossaryEntry } from "@faridalms/domain/glossary";
import type { ReactNode } from "react";

import { termKey } from "@faridalms/domain/glossary";
import { BookA } from "lucide-react";

import { StoredImage } from "./files";

export interface GlossaryViewStrings {
  glossary: string;
  fileRemoved: string;
}

/**
 * A document's glossary: each word it defines, with the word in another
 * language and a picture where the teacher gave them, as the reader and the
 * editor both show it.
 */
export function GlossaryList({
  entries,
  url,
  strings,
  speaker,
}: {
  entries: readonly GlossaryEntry[];
  url?: ((fileId: string) => string | undefined) | undefined;
  strings: GlossaryViewStrings;
  /** A button reading a word aloud, beside each word; none without it. */
  speaker?: ((text: string) => ReactNode) | undefined;
}) {
  return (
    <>
      <p className="fe-glossary-title">
        <BookA aria-hidden className="size-3.5" />
        {strings.glossary}
      </p>
      {entries.length > 0 ? (
        <dl>
          {entries.map((entry) => {
            const src = entry.fileId ? url?.(entry.fileId) : undefined;
            return (
              <div
                key={termKey(entry.words)}
                dir="auto"
                className="fe-glossary-entry"
              >
                <dt>
                  <bdi>{entry.words}</bdi>
                  {entry.gloss ? (
                    <span className="fe-glossary-gloss">
                      <bdi>{entry.gloss}</bdi>
                    </span>
                  ) : null}
                  {speaker?.(entry.words)}
                </dt>
                <dd>{entry.definition}</dd>
                {src ? (
                  <dd className="fe-glossary-picture">
                    <StoredImage
                      src={src}
                      alt={entry.alt ?? ""}
                      loading="lazy"
                      removed={strings.fileRemoved}
                    />
                  </dd>
                ) : null}
              </div>
            );
          })}
        </dl>
      ) : null}
    </>
  );
}
