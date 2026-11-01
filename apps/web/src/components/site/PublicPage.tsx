import type { SiteLocale } from "@faridalms/domain/website";
import type { ReactNode } from "react";

import { Link } from "@tanstack/react-router";

import type {
  publicPageQuery,
  publicPostQuery,
  publicPostsQuery,
} from "~/queries/site";

import { ContentView } from "~/components/content/ContentView";
import * as m from "~/i18n/messages";
import { formatInstant } from "~/utils/datetime";

import type { PublicSite } from "./SiteShell";

import { opensOnPicture, PageSections } from "./render/page";
import { publicMediaUrl } from "./render/parts";
import { schemeStyle } from "./render/theme";
import { langSearch, publicContext, SiteShell } from "./SiteShell";

type Page = Awaited<
  ReturnType<NonNullable<ReturnType<typeof publicPageQuery>["queryFn"]>>
>;
type Posts = Awaited<
  ReturnType<NonNullable<ReturnType<typeof publicPostsQuery>["queryFn"]>>
>;
type Post = Awaited<
  ReturnType<NonNullable<ReturnType<typeof publicPostQuery>["queryFn"]>>
>;

export function PublicPageView({
  page,
  site,
  school,
  slug,
}: {
  page: Page;
  site: PublicSite;
  school: string;
  /** The page's address, "" for the home page. */
  slug: string;
}) {
  return (
    <SiteShell
      site={site}
      school={school}
      overlay={opensOnPicture(page.sections)}
      media={page.media}
    >
      <PageSections
        sections={page.sections}
        title={page.title}
        context={publicContext(site, school, {
          media: page.media,
          news: page.news,
          events: page.events,
          page: slug,
        })}
      />
    </SiteShell>
  );
}

/** The top of a page the site draws itself, such as the news list or a post. */
function PageBand({
  site,
  children,
}: {
  site: PublicSite;
  children: ReactNode;
}) {
  return (
    <section className="site-section" style={schemeStyle(site.theme, "soft")}>
      <div className="mx-auto grid max-w-[72rem] gap-4 px-5 py-[calc(var(--s-space)*0.6)] @3xl/site:px-8">
        {children}
      </div>
    </section>
  );
}

export function PostList({
  posts,
  site,
  school,
}: {
  posts: Posts["rows"];
  site: PublicSite;
  school: string;
}) {
  const t = { locale: site.locale };
  if (posts.length === 0)
    return <p className="site-muted">{m.siteNoNews({}, t)}</p>;
  return (
    <ul className="grid gap-6 @3xl/site:grid-cols-2 @5xl/site:grid-cols-3">
      {posts.map((post) => (
        <li key={post.postId}>
          <Link
            to="/site/$school/news/$slug"
            params={{ school, slug: post.slug }}
            search={langSearch(site)}
            className="site-card flex h-full flex-col overflow-hidden transition-transform hover:-translate-y-0.5"
          >
            {post.coverKey ? (
              <img
                src={publicMediaUrl(post.coverKey)}
                alt={post.coverAlt}
                loading="lazy"
                className="site-media aspect-[3/2] rounded-none"
              />
            ) : null}
            <div className="grid gap-2 p-6">
              <time className="site-muted text-sm" dateTime={post.publishedAt}>
                {formatInstant(post.publishedAt, "date", site.locale)}
              </time>
              <span className="site-heading site-h3">
                {post.pinned ? (
                  <span className="site-eyebrow me-2 align-middle">
                    {m.sitePinned({}, t)}
                  </span>
                ) : null}
                {post.title}
              </span>
              {post.excerpt ? (
                <span className="site-muted">{post.excerpt}</span>
              ) : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function NewsFrame({
  site,
  school,
  title,
  children,
}: {
  site: PublicSite;
  school: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <SiteShell site={site} school={school}>
      <PageBand site={site}>
        <h1 className="site-heading site-display">{title}</h1>
      </PageBand>
      <section
        className="site-section"
        style={schemeStyle(site.theme, "canvas")}
      >
        <div className="mx-auto grid max-w-[72rem] gap-8 px-5 py-[calc(var(--s-space)*0.8)] @3xl/site:px-8">
          {children}
        </div>
      </section>
    </SiteShell>
  );
}

export function PublicPostView({
  post,
  site,
  school,
}: {
  post: Post;
  site: PublicSite;
  school: string;
}) {
  const t = { locale: site.locale };
  const bodyLocale: SiteLocale = post.bodyLocale;
  return (
    <SiteShell site={site} school={school}>
      <PageBand site={site}>
        <Link
          to="/site/$school/news"
          params={{ school }}
          search={langSearch(site)}
          className="site-link justify-self-start text-sm"
        >
          {m.siteAllNews({}, t)}
        </Link>
        <h1 className="site-heading site-display max-w-4xl">{post.title}</h1>
        <time className="site-muted" dateTime={post.publishedAt}>
          {formatInstant(post.publishedAt, "date", site.locale)}
        </time>
      </PageBand>
      <article
        className="site-section"
        style={schemeStyle(site.theme, "canvas")}
      >
        <div className="mx-auto grid max-w-3xl gap-8 px-5 py-[calc(var(--s-space)*0.8)] @3xl/site:px-8">
          {post.coverKey ? (
            <img
              src={publicMediaUrl(post.coverKey)}
              alt={post.coverAlt}
              className="site-media aspect-[16/9]"
            />
          ) : null}
          <div
            lang={bodyLocale === site.locale ? undefined : bodyLocale}
            dir={
              bodyLocale === site.locale
                ? undefined
                : bodyLocale === "ar"
                  ? "rtl"
                  : "ltr"
            }
            className="site-prose"
          >
            <ContentView
              document={post.body}
              fileUrl={(id) => {
                const key = post.media[id];
                return key ? publicMediaUrl(key) : "";
              }}
            />
          </div>
        </div>
      </article>
    </SiteShell>
  );
}
