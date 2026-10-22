import type { PictureCredit } from "@faridalms/domain/commons";

import { creditSource } from "@faridalms/domain/commons";
import { Fragment } from "react";

import { cx } from "./ui";

const link = (href: string, words: string, rel = "noopener noreferrer") => (
  <a href={href} target="_blank" rel={rel}>
    {words}
  </a>
);

/**
 * A picture's credit under it, as its licence asks: who made it, the
 * licence linked to its terms, and the page it came from.
 */
export function PictureCreditLine({
  credit,
  className,
}: {
  credit: PictureCredit;
  className?: string;
}) {
  const parts = [
    ...(credit.author
      ? [{ key: "author", node: <bdi>{credit.author}</bdi> }]
      : []),
    ...(credit.licence
      ? [
          {
            key: "licence",
            node: credit.licenceUrl ? (
              link(
                credit.licenceUrl,
                credit.licence,
                "license noopener noreferrer",
              )
            ) : (
              <span>{credit.licence}</span>
            ),
          },
        ]
      : []),
    ...(credit.source
      ? [{ key: "source", node: link(credit.source, creditSource(credit)) }]
      : []),
  ];
  return (
    <p
      className={cx(
        "mt-1 text-center text-xs text-muted-foreground [&_a]:underline [&_a]:decoration-muted-foreground/40 [&_a]:underline-offset-2 [&_a:hover]:text-foreground",
        className,
      )}
    >
      {parts.map((part, index) => (
        <Fragment key={part.key}>
          {index > 0 ? " · " : null}
          {part.node}
        </Fragment>
      ))}
    </p>
  );
}
