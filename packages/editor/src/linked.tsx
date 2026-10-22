import type { ReactNode } from "react";

const URL_IN_TEXT = /(https?:\/\/[^\s]+?)(?=[.,;]?(?:\s|$))/u;

/** Words with any address in them made a link, as a citation's DOI or page. */
export function linked(text: string, key: string): ReactNode[] {
  return text.split(URL_IN_TEXT).map((part, index) =>
    index % 2 === 1 ? (
      <a key={`${key}.${index}`} href={part} target="_blank" rel="noreferrer">
        {part}
      </a>
    ) : (
      part
    ),
  );
}
