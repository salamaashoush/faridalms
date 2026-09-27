import type { SiteLocale } from "@faridalms/domain/website";

import { Link } from "@tanstack/react-router";

import type {
  publicPageQuery,
  publicPostQuery,
  publicPostsQuery,
} from "~/queries/site";

import { ContentView } from "~/components/content/ContentView";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";

import type { PublicSite } from "./SiteShell";

import { publicMediaUrl, SectionView, siteDate } from "./SectionView";
import { langSearch } from "./SiteShell";

type Page = Awaited<
  ReturnType<NonNullable<ReturnType<typeof publicPageQuery>["queryFn"]>>
>;
type Posts = Awaited<
  ReturnType<NonNullable<ReturnType<typeof publicPostsQuery>["queryFn"]>>
>;
type Post = Awaited<
  ReturnType<NonNullable<ReturnType<typeof publicPostQuery>["queryFn"]>>
>;

const media = (map: Record<string, string>) => (fileId: string) => {
  const key = map[fileId];
  return key ? publicMediaUrl(key) : null;
};

/**
 * A published page. The title is the page's one first-level heading; on the
 * home page a hero already says it visually, so the title is for screen
 * readers there.
 */
export function PublicPageView({
  page,
  site,
  school,
}: {
  page: Page;
  site: PublicSite;
  school: string;
}) {
  const heroFirst = page.isHome && page.sections[0]?.section.type === "hero";
  return (
    <article className="grid gap-10">
      <h1
        className={cn(
          "text-3xl leading-tight font-semibold tracking-tight sm:text-4xl",
          heroFirst && "sr-only",
        )}
      >
        {page.title}
      </h1>
      <SectionView
        sections={page.sections}
        locale={page.locale}
        context={{
          school,
          fileUrl: media(page.media),
          news: page.news,
          contact: site.contact,
          locale: page.locale,
        }}
      />
    </article>
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
    return (
      <p className="text-sm text-muted-foreground">{m.siteNoNews({}, t)}</p>
    );
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <li
          key={post.postId}
          className="overflow-hidden rounded-xl border bg-card"
        >
          <Link
            to="/site/$school/news/$slug"
            params={{ school, slug: post.slug }}
            search={langSearch(site)}
            className="block h-full transition-colors hover:bg-muted/40"
          >
            {post.coverKey ? (
              <img
                src={publicMediaUrl(post.coverKey)}
                alt={post.coverAlt}
                loading="lazy"
                className="aspect-[3/2] w-full object-cover"
              />
            ) : null}
            <div className="grid gap-1 p-5">
              <time
                className="text-[13px] text-muted-foreground"
                dateTime={post.publishedAt}
              >
                {siteDate(post.publishedAt, site.locale)}
              </time>
              <span className="text-base leading-6 font-semibold">
                {post.pinned ? (
                  <span className="me-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                    {m.sitePinned({}, t)}
                  </span>
                ) : null}
                {post.title}
              </span>
              {post.excerpt ? (
                <span className="text-sm leading-6 text-muted-foreground">
                  {post.excerpt}
                </span>
              ) : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
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
    <article className="mx-auto grid w-full max-w-3xl gap-6">
      <Link
        to="/site/$school/news"
        params={{ school }}
        search={langSearch(site)}
        className="justify-self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {m.siteAllNews({}, t)}
      </Link>
      <header className="grid gap-2">
        <h1 className="text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          {post.title}
        </h1>
        <time
          className="text-sm text-muted-foreground"
          dateTime={post.publishedAt}
        >
          {siteDate(post.publishedAt, site.locale)}
        </time>
      </header>
      {post.coverKey ? (
        <img
          src={publicMediaUrl(post.coverKey)}
          alt={post.coverAlt}
          className="aspect-[16/9] w-full rounded-xl object-cover"
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
      >
        <ContentView
          document={post.body}
          fileUrl={(id) => {
            const key = post.media[id];
            return key ? publicMediaUrl(key) : "";
          }}
        />
      </div>
    </article>
  );
}
