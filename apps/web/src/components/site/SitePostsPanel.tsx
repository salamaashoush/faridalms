import type { SitePostsQuery } from "@faridalms/domain/site";

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Newspaper, Plus } from "lucide-react";
import { toast } from "sonner";

import { DirectoryPagination } from "~/components/admin/DirectoryPagination";
import { ButtonLink } from "~/components/app/ButtonLink";
import { EmptyState, SectionCard, Value } from "~/components/app/primitives";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { sitePostsQuery } from "~/queries/site";
import { unpublishSitePost } from "~/server/site";
import { formatDateTime } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

const STATUSES = ["all", "draft", "published"] as const;

export function postState(post: { status: string; publishAt: Date | null }) {
  if (post.status !== "published") return "draft" as const;
  return post.publishAt && post.publishAt.getTime() > Date.now()
    ? ("scheduled" as const)
    : ("published" as const);
}

export function PostStateBadge({
  post,
}: {
  post: { status: string; publishAt: Date | null };
}) {
  const state = postState(post);
  return (
    <Badge
      variant={
        state === "published"
          ? "default"
          : state === "scheduled"
            ? "secondary"
            : "outline"
      }
    >
      {state === "published"
        ? m.siteStatusPublished()
        : state === "scheduled"
          ? m.siteStatusScheduled()
          : m.siteStatusDraft()}
    </Badge>
  );
}

export function SitePostsPanel({
  query,
  onQuery,
}: {
  query: SitePostsQuery;
  onQuery: (next: SitePostsQuery) => void;
}) {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(sitePostsQuery(query));
  const unpublish = useServerFn(unpublishSitePost);
  const mutation = useMutation({
    mutationFn: (input: { id: string; expectedRevision: number }) =>
      unpublish({ data: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["site"] });
      await queryClient.invalidateQueries({ queryKey: ["public-site"] });
      toast.success(m.siteUnpublishedToast());
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <SectionCard
      title={m.siteTabPosts()}
      description={m.sitePostsHint()}
      actions={
        <ButtonLink size="sm" to="/admin/site-post-editor" search={{}}>
          <Plus aria-hidden />
          {m.siteNewPost()}
        </ButtonLink>
      }
    >
      <fieldset className="mb-4 flex flex-wrap gap-2">
        <legend className="sr-only">{m.siteStatusFilter()}</legend>
        {STATUSES.map((status) => (
          <Button
            key={status}
            type="button"
            size="sm"
            variant={query.status === status ? "secondary" : "outline"}
            aria-pressed={query.status === status}
            onClick={() => onQuery({ status, page: 1 })}
          >
            {status === "all"
              ? m.siteAllPosts()
              : status === "draft"
                ? m.siteStatusDraft()
                : m.siteStatusPublished()}
          </Button>
        ))}
      </fieldset>
      {data.rows.length === 0 ? (
        <EmptyState icon={Newspaper} title={m.siteNoPostsAdmin()} />
      ) : (
        <ul className="divide-y">
          {data.rows.map((post) => (
            <li
              key={post.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <Link
                  to="/admin/site-post-editor"
                  search={{ id: post.id }}
                  className="font-medium hover:text-primary hover:underline"
                >
                  {post.title}
                </Link>
                <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <span dir="ltr">/{post.slug}</span>
                  <span>·</span>
                  <span>
                    {post.locale === "ar"
                      ? m.newsletterArabic()
                      : m.newsletterEnglish()}
                  </span>
                  <span>·</span>
                  <span>
                    <Value>{post.category?.name}</Value>
                  </span>
                  {post.publishAt ? (
                    <>
                      <span>·</span>
                      <span>
                        {formatDateTime(post.publishAt.toISOString())}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
              <PostStateBadge post={post} />
              {post.status === "published" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({
                      id: post.id,
                      expectedRevision: post.revision,
                    })
                  }
                >
                  {m.siteUnpublish()}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4">
        <DirectoryPagination
          page={data.page}
          pages={data.pages}
          total={data.total}
          onPage={(page) => onQuery({ ...query, page })}
        />
      </div>
    </SectionCard>
  );
}
