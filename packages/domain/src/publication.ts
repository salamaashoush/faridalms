export const PUBLICATION_STATES = ["draft", "published", "archived"] as const;
export type PublicationState = (typeof PUBLICATION_STATES)[number];

/** Where a publication stands for whoever manages it: published with a time still to come is scheduled. */
export type PublicationPhase = PublicationState | "scheduled";

export interface Publishable {
  state: string;
  publishAt: string | null;
}

const millis = (value: string) => Date.parse(value);

/** Whether readers have it now: published, and its time has come. */
export const isLive = (row: Publishable, now: Date): boolean =>
  row.state === "published" &&
  row.publishAt !== null &&
  millis(row.publishAt) <= now.getTime();

export function phaseOf(row: Publishable, now: Date): PublicationPhase {
  if (row.state === "published")
    return row.publishAt !== null && millis(row.publishAt) > now.getTime()
      ? "scheduled"
      : "published";
  return row.state === "archived" ? "archived" : "draft";
}

/** Whether a time asked for publishing lies ahead of `now`, so the item waits for it. */
export const isLater = (publishAt: string | null | undefined, now: Date) =>
  Boolean(publishAt) && millis(publishAt ?? "") > now.getTime();
