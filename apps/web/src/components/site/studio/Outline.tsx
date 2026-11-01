import type { PageSection, SiteLocale } from "@faridalms/domain/site-sections";
import type { LucideIcon } from "lucide-react";

import { withoutEmphasis } from "@faridalms/domain/site-sections";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  Award,
  Blocks,
  CalendarDays,
  CircleAlert,
  Contact,
  EyeOff,
  FileText,
  GalleryHorizontal,
  GalleryHorizontalEnd,
  GitCommitVertical,
  GripVertical,
  Images,
  Languages,
  LayoutGrid,
  LayoutPanelTop,
  Link2,
  DoorOpen,
  FileUser,
  LogIn,
  ListChecks,
  ListCollapse,
  Megaphone,
  MessageSquareQuote,
  MonitorPlay,
  Newspaper,
  PanelTop,
  PictureInPicture2,
  Plus,
  Quote,
  Receipt,
  School,
  Send,
  Sparkles,
  Type,
  Users,
  BarChart3,
  Code2,
  Mail,
  UserPlus,
} from "lucide-react";
import { useId, useState } from "react";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import { SECTION_LABEL } from "./labels";

export const SECTION_ICON: Record<PageSection["type"], LucideIcon> = {
  hero: PanelTop,
  slides: GalleryHorizontal,
  blocks: Blocks,
  pageHeader: LayoutPanelTop,
  announcement: Megaphone,
  welcome: Mail,
  text: Type,
  imageText: PictureInPicture2,
  cards: LayoutGrid,
  divisions: School,
  stats: BarChart3,
  pillars: Sparkles,
  quote: Quote,
  voices: MessageSquareQuote,
  people: Users,
  video: MonitorPlay,
  gallery: Images,
  timeline: GitCommitVertical,
  accordion: ListCollapse,
  logos: Award,
  news: Newspaper,
  events: CalendarDays,
  admissions: FileText,
  steps: ListChecks,
  fees: Receipt,
  contact: Contact,
  form: Send,
  quickLinks: Link2,
  embed: Code2,
  signIn: LogIn,
  register: UserPlus,
  apply: FileUser,
  registerApply: DoorOpen,
};

/** A short line saying what a section holds, from its heading or first words. */
function gist(section: PageSection): string {
  const data = section.data as Record<string, unknown>;
  for (const key of ["heading", "text", "quote"]) {
    const words = data[key];
    if (typeof words === "string" && words.trim())
      return withoutEmphasis(words);
  }
  return "";
}

/**
 * The page's sections in order: select one to edit it, drag or use the
 * arrows to reorder, and see which have problems or lack a translation.
 */
export function Outline({
  sections,
  selected,
  locale,
  problems,
  untranslated,
  onSelect,
  onReorder,
  onAdd,
}: {
  sections: PageSection[];
  selected: string | null;
  locale: SiteLocale;
  problems: Set<string>;
  untranslated: Set<string>;
  onSelect: (id: string) => void;
  onReorder: (from: number, to: number) => void;
  onAdd: () => void;
}) {
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const hintId = useId();
  return (
    <div className="grid gap-3 px-3 py-3">
      <p id={hintId} className="sr-only">
        {m.siteReorderHint()}
      </p>
      <ol className="grid gap-1">
        {sections.map((section, index) => {
          const Icon = SECTION_ICON[section.type];
          const hidden = section.style.hideIn.includes(locale);
          return (
            <li key={section.id}>
              <div
                draggable
                onDragStart={(event) => {
                  setDragging(index);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setOver(index);
                }}
                onDragLeave={() =>
                  setOver((current) => (current === index ? null : current))
                }
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragging !== null && dragging !== index)
                    onReorder(dragging, index);
                  setDragging(null);
                  setOver(null);
                }}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
                className={cn(
                  "rounded-lg",
                  over === index &&
                    dragging !== index &&
                    "ring-2 ring-primary/50",
                  dragging === index && "opacity-50",
                )}
              >
                <button
                  type="button"
                  aria-current={selected === section.id ? "true" : undefined}
                  aria-describedby={hintId}
                  onClick={() => onSelect(section.id)}
                  onKeyDown={(event) => {
                    if (
                      !event.altKey ||
                      (event.key !== "ArrowUp" && event.key !== "ArrowDown")
                    )
                      return;
                    event.preventDefault();
                    const target = index + (event.key === "ArrowUp" ? -1 : 1);
                    if (target >= 0 && target < sections.length)
                      onReorder(index, target);
                  }}
                  className="group flex min-h-12 w-full items-center gap-2 rounded-lg px-2 text-start hover:bg-muted aria-[current=true]:bg-primary/10 aria-[current=true]:text-primary"
                >
                  <GripVertical
                    aria-hidden
                    className="size-4 shrink-0 cursor-grab text-muted-foreground/60"
                  />
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground group-aria-[current=true]:bg-primary/15 group-aria-[current=true]:text-primary">
                    <Icon aria-hidden className="size-4" />
                  </span>
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate text-sm font-medium">
                      <span className="sr-only">
                        {formatNumber(index + 1)}.{" "}
                      </span>
                      {SECTION_LABEL[section.type]()}
                    </span>
                    {gist(section) ? (
                      <span className="truncate text-xs text-muted-foreground">
                        {gist(section)}
                      </span>
                    ) : null}
                  </span>
                  {problems.has(section.id) ? (
                    <CircleAlert
                      aria-label={m.siteHasProblems()}
                      className="size-4 shrink-0 text-destructive"
                    />
                  ) : null}
                  {untranslated.has(section.id) ? (
                    <Languages
                      aria-label={m.siteNeedsTranslation()}
                      className="size-4 shrink-0 text-warning"
                    />
                  ) : null}
                  {hidden ? (
                    <EyeOff
                      aria-label={m.siteHiddenHere()}
                      className="size-4 shrink-0 text-muted-foreground"
                    />
                  ) : null}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <Button
        type="button"
        variant="outline"
        className="w-full max-md:h-10"
        onClick={onAdd}
      >
        <Plus aria-hidden />
        {m.siteAddSection()}
      </Button>
      {sections.length === 0 ? (
        <p className="text-center text-[13px] leading-[18px] text-muted-foreground">
          <GalleryHorizontalEnd aria-hidden className="mx-auto mb-2 size-6" />
          {m.siteNoSectionsYet()}
        </p>
      ) : null}
    </div>
  );
}
