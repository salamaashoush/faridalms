import type { AudienceInput } from "@faridalms/domain/announcements";
import type { ContentDocument } from "@faridalms/domain/content";
import type { ContentLocale } from "@faridalms/domain/translations";
import type { ComponentType } from "react";

import type { PictureChannel } from "~/components/files/PicturedPeople";
import type { SlotQuery } from "~/utils/extension";

import { slot } from "~/utils/extension";

/** The words for an audience a module adds to announcements and events: a grade, say. */
export type AudienceKind = {
  scope: string;
  /** The audience as a choice beside the school's own: "A grade". */
  label: () => string;
  /** Who a new announcement goes to until its author chooses: every family. */
  first?: boolean;
} & (
  | {
      /** What a row of it names, as its field is called: "Grade". */
      target: () => string;
      /** The empty choice: "Choose a grade". */
      pick: () => string;
    }
  | { target?: never; pick?: never }
);

export const audienceKinds = slot<AudienceKind>("audience kinds");

/** Who a new announcement goes to: a module's first audience, or the whole school. */
export const firstAudience = (
  kinds: readonly AudienceKind[],
): AudienceInput[] => [
  {
    scope: kinds.find((kind) => kind.first)?.scope ?? "school",
    classId: "",
    targetId: "",
  },
];

/** The module's kind for a scope when it names no target: every family, say. */
export const wholeKind = (
  kinds: readonly AudienceKind[],
  scope: string,
): AudienceKind | undefined =>
  kinds.find((kind) => kind.scope === scope && kind.target === undefined);

/** What a copy's settings are drawn with in the announcement's editor. */
export interface AnnouncementCopyFieldProps {
  /** The copy's settings, null where the announcement has none. */
  value: unknown;
  onChange: (value: unknown) => void;
  /** The writer set something the copy would otherwise follow from the title. */
  onTouched: () => void;
  /** The language being written. */
  shown: ContentLocale;
  cover: { fileId: string; altEn: string; altAr: string };
  onCover: (patch: {
    coverFileId?: string;
    coverAltEn?: string;
    coverAltAr?: string;
  }) => void;
  onPeople: (fileId: string) => void;
  /** What stops the copy going out, in the writer's words. */
  problems: readonly string[];
}

/** The words an announcement's copy is checked by. */
export interface AnnouncementCopyWords {
  primaryLocale: ContentLocale;
  body: ContentDocument;
  /** The translation, where it is written. */
  translation: ContentDocument | null;
  cover: { fileId: string; altEn: string; altAr: string };
}

/**
 * Where a module puts an announcement beyond its audience, the website
 * say: its settings in the editor, kept by the module under its key and
 * read from its own procedures. Methods, so each module types its value.
 */
export interface AnnouncementCopyPart {
  key: string;
  /** What the module keeps of an announcement already written; null where none. */
  initial(announcementId: string): SlotQuery<unknown>;
  /** Whether the value puts the announcement before everyone, so it may tell nobody. */
  opens(value: unknown): boolean;
  /** The value as the title changes, until the writer sets what follows it. */
  titled(value: unknown, titleEn: string): unknown;
  /** What is saved for the value, with whatever the writer left empty filled in. */
  sent(value: unknown, titleEn: string): unknown;
  /** The value made free again after the server refused it as taken, or null. */
  freed(value: unknown, refusal: string): unknown;
  /** What stops the copy going out, in the writer's words. */
  problems(value: unknown, words: AnnouncementCopyWords): string[];
  /** Whose consent the pictures are checked against while it opens. */
  pictured: PictureChannel;
  /** Where it stands besides its audience, in the editor's summary and the office's list. */
  where: () => string;
  /** Where it stands, beside an announcement in a reader's list. */
  on: () => string;
  /** The choice that puts it there, beside who it reaches. */
  Toggle: ComponentType<AnnouncementCopyFieldProps>;
  /** Its own settings, among the announcement's details while it opens. */
  Settings: ComponentType<AnnouncementCopyFieldProps>;
}

export const announcementCopyParts = slot<AnnouncementCopyPart>(
  "announcement copy parts",
);
