import type {
  PageSection,
  SectionOf,
  SiteImage,
  SiteLocale,
} from "@faridalms/domain/website";
import type { ReactNode } from "react";

import { ChevronDown, Mail, MapPin, Phone } from "lucide-react";

import { ContentView } from "~/components/content/ContentView";
import { buttonVariants } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";

import { siteHref } from "./format";

export interface NewsItem {
  postId: string;
  slug: string;
  title: string;
  excerpt: string;
  coverKey: string | null;
  coverAlt: string;
  publishedAt: string;
}

export interface SiteContact {
  address: { lines?: string[]; city?: string; country?: string } | null;
  phone: string | null;
  email: string | null;
}

export interface SectionContext {
  school: string;
  /** Where a file the page shows is served from, or null when it is not available. */
  fileUrl: (fileId: string) => string | null;
  news: NewsItem[];
  contact: SiteContact | null;
  /** The language the site is shown in. */
  locale: SiteLocale;
  /** Links go nowhere in the editor's preview. */
  preview?: boolean;
}

export const publicMediaUrl = (key: string) => `/public-media/${key}`;

/** A day in the site's language, which may differ from the reader's own setting. */
export function siteDate(iso: string, locale: SiteLocale): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export function hasContact(contact: SiteContact | null): boolean {
  return Boolean(
    contact &&
    (contact.phone ||
      contact.email ||
      contact.address?.lines?.length ||
      contact.address?.city),
  );
}

function Heading({ children }: { children: string }) {
  return children ? (
    <h2 className="text-2xl leading-8 font-semibold tracking-tight">
      {children}
    </h2>
  ) : null;
}

function Picture({
  image,
  context,
  className,
}: {
  image: SiteImage;
  context: SectionContext;
  className?: string;
}) {
  const src = image.fileId ? context.fileUrl(image.fileId) : null;
  if (!src) return null;
  return (
    <img
      src={src}
      alt={image.alt}
      loading="lazy"
      className={cn("w-full rounded-xl object-cover", className)}
    />
  );
}

function SiteLink({
  href,
  context,
  className,
  children,
}: {
  href: string;
  context: SectionContext;
  className?: string;
  children: ReactNode;
}) {
  if (context.preview) return <span className={className}>{children}</span>;
  const target = siteHref(context.school, href);
  return target.startsWith("/") ? (
    <a href={target} className={className}>
      {children}
    </a>
  ) : (
    <a href={target} className={className} rel="noopener noreferrer">
      {children}
    </a>
  );
}

function Action({
  label,
  href,
  context,
  primary = true,
}: {
  label: string;
  href: string;
  context: SectionContext;
  primary?: boolean;
}) {
  if (!label || !href) return null;
  return (
    <SiteLink
      href={href}
      context={context}
      className={cn(
        buttonVariants({
          variant: primary ? "default" : "outline",
          size: "lg",
        }),
        "justify-self-start",
      )}
    >
      {label}
    </SiteLink>
  );
}

function Hero({
  section,
  context,
}: {
  section: SectionOf<"hero">;
  context: SectionContext;
}) {
  const picture = section.image.fileId
    ? context.fileUrl(section.image.fileId)
    : null;
  return (
    <div
      className={cn(
        "grid items-center gap-8 rounded-2xl bg-muted/50 p-6 @2xl:p-10",
        picture && "@5xl:grid-cols-2",
      )}
    >
      <div className="grid gap-4">
        <p className="text-3xl leading-tight font-semibold tracking-tight @2xl:text-4xl">
          {section.heading}
        </p>
        {section.text ? (
          <p className="text-lg leading-7 text-muted-foreground">
            {section.text}
          </p>
        ) : null}
        <Action
          label={section.actionLabel}
          href={section.actionHref}
          context={context}
        />
      </div>
      <Picture
        image={section.image}
        context={context}
        className="aspect-[4/3]"
      />
    </div>
  );
}

function ImageText({
  section,
  context,
}: {
  section: SectionOf<"imageText">;
  context: SectionContext;
}) {
  return (
    <div className="grid items-center gap-8 @3xl:grid-cols-2">
      <div
        className={cn("grid gap-3", section.side === "end" && "@3xl:order-2")}
      >
        <Picture
          image={section.image}
          context={context}
          className="aspect-[4/3]"
        />
      </div>
      <div className="grid gap-3">
        <Heading>{section.heading}</Heading>
        <ContentView
          document={section.body}
          fileUrl={(id) => context.fileUrl(id) ?? ""}
        />
      </div>
    </div>
  );
}

function Cards({
  section,
  context,
}: {
  section: SectionOf<"cards">;
  context: SectionContext;
}) {
  return (
    <div className="grid gap-6">
      <Heading>{section.heading}</Heading>
      <ul className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
        {section.items.map((item) => {
          const body = (
            <>
              <Picture
                image={item.image}
                context={context}
                className="aspect-[3/2] rounded-b-none"
              />
              <div className="grid gap-1 p-5">
                <span className="text-base leading-6 font-semibold">
                  {item.title}
                </span>
                {item.text ? (
                  <span className="text-sm leading-6 text-muted-foreground">
                    {item.text}
                  </span>
                ) : null}
              </div>
            </>
          );
          return (
            <li
              key={item.id}
              className="overflow-hidden rounded-xl border bg-card"
            >
              {item.href ? (
                <SiteLink
                  href={item.href}
                  context={context}
                  className="block h-full transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {body}
                </SiteLink>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function News({
  section,
  context,
}: {
  section: SectionOf<"news">;
  context: SectionContext;
}) {
  const items = context.news.slice(0, section.count);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Heading>{section.heading}</Heading>
        <SiteLink
          href="/news"
          context={context}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {m.siteAllNews({}, { locale: context.locale })}
        </SiteLink>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {m.siteNoNews({}, { locale: context.locale })}
        </p>
      ) : (
        <ul className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
          {items.map((item) => (
            <li
              key={item.postId}
              className="overflow-hidden rounded-xl border bg-card"
            >
              <SiteLink
                href={`/news/${item.slug}`}
                context={context}
                className="block h-full transition-colors hover:bg-muted/40"
              >
                {item.coverKey ? (
                  <img
                    src={publicMediaUrl(item.coverKey)}
                    alt={item.coverAlt}
                    loading="lazy"
                    className="aspect-[3/2] w-full object-cover"
                  />
                ) : null}
                <div className="grid gap-1 p-5">
                  <time
                    className="text-[13px] text-muted-foreground"
                    dateTime={item.publishedAt}
                  >
                    {siteDate(item.publishedAt, context.locale)}
                  </time>
                  <span className="text-base leading-6 font-semibold">
                    {item.title}
                  </span>
                  {item.excerpt ? (
                    <span className="text-sm leading-6 text-muted-foreground">
                      {item.excerpt}
                    </span>
                  ) : null}
                </div>
              </SiteLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ContactDetails({ contact }: { contact: SiteContact | null }) {
  if (!contact) return null;
  const address = [
    ...(contact.address?.lines ?? []),
    contact.address?.city,
    contact.address?.country,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <ul className="grid gap-2 text-sm leading-6">
      {address ? (
        <li className="flex items-start gap-2">
          <MapPin
            aria-hidden
            className="mt-1 size-4 shrink-0 text-muted-foreground"
          />
          <span dir="auto">{address}</span>
        </li>
      ) : null}
      {contact.phone ? (
        <li className="flex items-start gap-2">
          <Phone
            aria-hidden
            className="mt-1 size-4 shrink-0 text-muted-foreground"
          />
          <a
            href={`tel:${contact.phone}`}
            dir="ltr"
            className="hover:underline"
          >
            {contact.phone}
          </a>
        </li>
      ) : null}
      {contact.email ? (
        <li className="flex items-start gap-2">
          <Mail
            aria-hidden
            className="mt-1 size-4 shrink-0 text-muted-foreground"
          />
          <a
            href={`mailto:${contact.email}`}
            dir="ltr"
            className="hover:underline"
          >
            {contact.email}
          </a>
        </li>
      ) : null}
    </ul>
  );
}

function Section({
  section,
  context,
}: {
  section: PageSection;
  context: SectionContext;
}) {
  switch (section.type) {
    case "hero":
      return <Hero section={section} context={context} />;
    case "text":
      return (
        <div className="grid max-w-3xl gap-3">
          <Heading>{section.heading}</Heading>
          <ContentView
            document={section.body}
            fileUrl={(id) => context.fileUrl(id) ?? ""}
          />
        </div>
      );
    case "imageText":
      return <ImageText section={section} context={context} />;
    case "cards":
      return <Cards section={section} context={context} />;
    case "action":
      return (
        <div className="grid justify-items-start gap-4 rounded-2xl bg-primary/10 p-6 @2xl:p-10">
          <Heading>{section.heading}</Heading>
          {section.text ? (
            <p className="text-base leading-7">{section.text}</p>
          ) : null}
          <Action
            label={section.actionLabel}
            href={section.actionHref}
            context={context}
          />
        </div>
      );
    case "accordion":
      return (
        <div className="grid max-w-3xl gap-4">
          <Heading>{section.heading}</Heading>
          <div className="divide-y rounded-xl border">
            {section.items.map((item) => (
              <details key={item.id} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-medium marker:hidden [&::-webkit-details-marker]:hidden">
                  {item.title}
                  <ChevronDown
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className="mt-2 text-sm leading-6 whitespace-pre-line text-muted-foreground">
                  {item.text}
                </p>
              </details>
            ))}
          </div>
        </div>
      );
    case "news":
      return <News section={section} context={context} />;
    case "gallery":
      return (
        <div className="grid gap-6">
          <Heading>{section.heading}</Heading>
          <ul className="grid grid-cols-2 gap-3 @3xl:grid-cols-3">
            {section.images.map((image) => (
              <li key={image.id}>
                <Picture
                  image={image}
                  context={context}
                  className="aspect-square"
                />
              </li>
            ))}
          </ul>
        </div>
      );
    case "contact":
      return (
        <div className="grid max-w-3xl gap-4">
          <Heading>{section.heading}</Heading>
          {section.text ? (
            <p className="text-base leading-7">{section.text}</p>
          ) : null}
          <ContactDetails contact={context.contact} />
        </div>
      );
    case "embed":
      return (
        <div className="grid max-w-3xl gap-4">
          <Heading>{section.heading}</Heading>
          <ContentView
            document={{
              root: {
                type: "root",
                version: 1,
                children: [
                  {
                    type: "embed",
                    version: 1,
                    provider: section.provider,
                    embedId: section.embedId,
                  },
                ],
              },
            }}
          />
        </div>
      );
  }
  return null;
}

/**
 * A page's sections as visitors see them. Each section carries the language
 * it is shown in, so one still waiting for its translation is read aloud in
 * the language it is written in.
 */
export function SectionView({
  sections,
  context,
  locale,
}: {
  sections: { section: PageSection; locale: SiteLocale }[];
  context: SectionContext;
  locale: SiteLocale;
}) {
  return (
    <div className="@container grid gap-12 @2xl:gap-16">
      {sections.map(({ section, locale: shown }) => (
        <section
          key={section.id}
          lang={shown === locale ? undefined : shown}
          dir={shown === locale ? undefined : shown === "ar" ? "rtl" : "ltr"}
        >
          <Section section={section} context={context} />
        </section>
      ))}
    </div>
  );
}
