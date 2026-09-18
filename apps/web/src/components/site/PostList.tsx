import type { SiteLocale } from "@faridalms/domain/site";

import { Link } from "@tanstack/react-router";
import { Newspaper } from "lucide-react";

import type { getPublicPosts } from "~/server/site";

import { EmptyState } from "~/components/app/primitives";
import { Badge } from "~/components/ui/badge";
import * as m from "~/i18n/messages";
import { formatDate } from "~/utils/datetime";

import { siteMediaUrl } from "./SiteShell";

type Post = Awaited<ReturnType<typeof getPublicPosts>>["rows"][number];

export function PostList({
  posts,
  school,
  locale,
}: {
  posts: Post[];
  school: string;
  locale: SiteLocale;
}) {
  if (posts.length === 0)
    return <EmptyState icon={Newspaper} title={m.siteNoPosts()} />;
  const media = siteMediaUrl(school);
  return (
    <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {posts.map((post) => (
        <li
          key={post.slug}
          className="flex flex-col overflow-hidden rounded-xl border bg-card"
        >
          {post.coverFileId ? (
            <img
              src={media(post.coverFileId)}
              alt=""
              loading="lazy"
              className="aspect-[16/9] w-full object-cover"
            />
          ) : null}
          <div className="flex flex-1 flex-col gap-2 p-5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <time dateTime={post.publishAt.toISOString()}>
                {formatDate(post.publishAt.toISOString())}
              </time>
              {post.category ? (
                <Badge variant="secondary">{post.category.name}</Badge>
              ) : null}
            </div>
            <h3 className="text-lg font-semibold">
              <Link
                to="/site/$school/blog/$slug"
                params={{ school, slug: post.slug }}
                search={{ lang: locale }}
                className="hover:text-primary hover:underline"
              >
                {post.title}
              </Link>
            </h3>
            {post.summary ? (
              <p className="text-sm text-muted-foreground">{post.summary}</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
