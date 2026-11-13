import type { SiteClass } from "@faridalms/domain/site-classes";
import type { SectionOf } from "@faridalms/domain/site-sections";

import { listedClasses } from "@faridalms/domain/site-classes";
import { cn } from "@faridalms/ui/cn";
import { CalendarDays } from "lucide-react";

import * as m from "~/i18n/messages";

import type { RenderContext } from "./parts";

import { SiteArt } from "./art";
import { classLengthWords, classWhenWords, teacherWords } from "./class-words";
import { Heading, PostCover, SectionIntro, SiteAnchor } from "./parts";

/** One class as a courses section draws it, from the school's classes or its samples. */
interface Listed {
  id: string;
  title: string;
  text: string;
  when: string;
  level: string;
  length: string;
  teachers: string;
  picture: SiteClass["picture"];
}

type Data = SectionOf<"courses">["data"];

/** The classes the section lists for a visitor; none while the school shows none that fit. */
export function coursesListed(data: Data, context: RenderContext): SiteClass[] {
  return listedClasses(data, context.classes ?? [], context.today ?? "");
}

const show = (on: "show" | "hide", words: string) =>
  on === "show" ? words : "";

function listed(data: Data, context: RenderContext): Listed[] {
  const real = coursesListed(data, context);
  if (context.editing && (context.classes ?? []).length === 0)
    return data.items.slice(0, data.count).map((item) => ({
      id: item.id,
      title: item.title,
      text: item.text,
      when: show(data.dates, item.when),
      level: show(data.level, item.level),
      length: "",
      teachers: "",
      picture: null,
    }));
  return real.map((row) => ({
    id: row.id,
    title: row.title,
    text: row.description,
    when: show(
      data.dates,
      classWhenWords(row, context.today ?? "", context.locale),
    ),
    level: show(data.level, row.level),
    length: show(data.duration, classLengthWords(row, context.locale)),
    teachers: show(data.teachers, teacherWords(row.teachers, context.locale)),
    picture: row.picture,
  }));
}

interface ItemButtonProps {
  data: Data;
  title: string;
  context: RenderContext;
  className?: string;
}

/** The section's one button, beside each class, named with the class it is for. */
function ItemButton({ data, title, context, className }: ItemButtonProps) {
  const action = data.action[0];
  if (!action?.label.trim()) return null;
  return (
    <SiteAnchor
      href={action.href}
      context={context}
      className={cn("site-button", className)}
    >
      {action.label}
      <span className="sr-only">
        {m.siteClassButtonFor({ title }, { locale: context.locale })}
      </span>
    </SiteAnchor>
  );
}

interface MetaProps {
  item: Listed;
}

function Meta({ item }: MetaProps) {
  const lines = [item.level, item.length, item.teachers].filter(Boolean);
  if (lines.length === 0) return null;
  return (
    <p className="site-meta flex flex-wrap gap-x-3 gap-y-1">
      {lines.map((line) => (
        <span key={line} dir="auto">
          {line}
        </span>
      ))}
    </p>
  );
}

export interface CoursesProps {
  section: SectionOf<"courses">;
  context: RenderContext;
}

/**
 * The classes a school shows on its website: cards, a ruled list with the
 * dates down its side, or a schedule. In the builder, a school that shows
 * no class yet sees the section's samples, and one whose shown classes the
 * section picks none of is told why it is empty.
 */
export function Courses({ section, context }: CoursesProps) {
  const { data, variant } = section;
  const t = { locale: context.locale };
  const items = listed(data, context);
  const intro = <SectionIntro heading={data.heading} text={data.text} />;
  if (items.length === 0)
    return (
      <div>
        {intro}
        <p className="site-empty">
          <span aria-hidden className="site-icon-tile">
            <CalendarDays />
          </span>
          <span className="site-heading site-h4 font-semibold">
            {m.siteClassesFromClasses({}, t)}
          </span>
        </p>
      </div>
    );
  if (variant === "list")
    return (
      <div>
        {intro}
        <ul
          data-stagger
          className="divide-y divide-[var(--s-border)] border-y border-[var(--s-border)]"
        >
          {items.map((item) => (
            <li
              key={item.id}
              className="grid gap-3 py-6 text-start @3xl/site:grid-cols-[11rem_1fr_auto] @3xl/site:items-start @3xl/site:gap-10"
            >
              <span className="site-meta">{item.when}</span>
              <div className="grid gap-2">
                <Heading level={3}>{item.title}</Heading>
                {item.text ? <p className="site-text">{item.text}</p> : null}
                <Meta item={item} />
              </div>
              <ItemButton
                data={data}
                title={item.title}
                context={context}
                className="justify-self-start"
              />
            </li>
          ))}
        </ul>
      </div>
    );
  if (variant === "table")
    return (
      <div className="site-narrow" data-wide>
        {intro}
        <ul data-stagger className="grid gap-4">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--s-border)] pb-4 text-start"
            >
              <div className="grid min-w-0 flex-1 basis-64 gap-1">
                <span className="font-semibold">{item.title}</span>
                {item.text ? (
                  <span className="site-meta">{item.text}</span>
                ) : null}
                <Meta item={item} />
              </div>
              {item.when ? (
                <span className="site-heading text-xl tabular-nums">
                  {item.when}
                </span>
              ) : null}
              <ItemButton data={data} title={item.title} context={context} />
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <div>
      {intro}
      <ul data-stagger className="site-grid" data-cols="3" data-rail>
        {items.map((item) => (
          <li
            key={item.id}
            className="site-card flex h-full flex-col overflow-hidden text-start"
          >
            {item.picture ? (
              <PostCover
                coverKey={item.picture.key}
                picture={item.picture.published}
                alt={item.picture.alt}
                loading="lazy"
                sizes="(min-width: 48rem) 33vw, 100vw"
                className="site-media site-photo aspect-[3/2] rounded-none"
              />
            ) : (
              <SiteArt seed={item.id} className="aspect-[3/2] rounded-none" />
            )}
            <div className="site-card-body flex-1">
              {item.when ? (
                <span className="site-eyebrow">{item.when}</span>
              ) : null}
              <Heading level={3}>{item.title}</Heading>
              {item.text ? (
                <p className="site-text line-clamp-4">{item.text}</p>
              ) : null}
              <Meta item={item} />
              <ItemButton
                data={data}
                title={item.title}
                context={context}
                className="mt-auto self-start justify-self-start"
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
