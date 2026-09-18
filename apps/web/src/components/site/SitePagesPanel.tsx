import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ButtonLink } from "~/components/app/ButtonLink";
import { EmptyState, SectionCard } from "~/components/app/primitives";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { sitePagesQuery } from "~/queries/site";
import {
  deleteSitePage,
  publishSitePage,
  unpublishSitePage,
} from "~/server/site";
import { formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

export function SitePagesPanel() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(sitePagesQuery);
  const publish = useServerFn(publishSitePage);
  const unpublish = useServerFn(unpublishSitePage);
  const remove = useServerFn(deleteSitePage);
  const [confirming, setConfirming] = useState<string>();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["site"] });
    await queryClient.invalidateQueries({ queryKey: ["public-site"] });
  };
  const mutation = useMutation({
    mutationFn: async (action: {
      kind: "publish" | "unpublish" | "delete";
      id: string;
      expectedRevision: number;
    }) => {
      if (action.kind === "publish")
        return publish({
          data: { id: action.id, expectedRevision: action.expectedRevision },
        });
      if (action.kind === "unpublish")
        return unpublish({
          data: { id: action.id, expectedRevision: action.expectedRevision },
        });
      return remove({ data: { id: action.id } });
    },
    onSuccess: async (_, action) => {
      await refresh();
      toast.success(
        action.kind === "publish"
          ? m.sitePublishedToast()
          : action.kind === "unpublish"
            ? m.siteUnpublishedToast()
            : m.siteDeletedToast(),
      );
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <SectionCard
      title={m.siteTabPages()}
      description={m.sitePagesHint()}
      actions={
        <ButtonLink size="sm" to="/admin/site-page-editor" search={{}}>
          <Plus aria-hidden />
          {m.siteNewPage()}
        </ButtonLink>
      }
    >
      {data.length === 0 ? (
        <EmptyState icon={FileText} title={m.siteNoPages()} />
      ) : (
        <ul className="divide-y">
          {data.map((page) => (
            <li
              key={page.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <Link
                  to="/admin/site-page-editor"
                  search={{ id: page.id }}
                  className="font-medium hover:text-primary hover:underline"
                >
                  {page.title}
                </Link>
                <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  <span dir="ltr">/{page.slug}</span>
                  <span>·</span>
                  <span>
                    {page.locale === "ar"
                      ? m.newsletterArabic()
                      : m.newsletterEnglish()}
                  </span>
                  {page.navGroup ? (
                    <>
                      <span>·</span>
                      <span>{page.navGroup}</span>
                    </>
                  ) : null}
                  {page.publishedAt ? (
                    <>
                      <span>·</span>
                      <span>
                        {m.sitePublishedOn({
                          date: formatDate(page.publishedAt.toISOString()),
                        })}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
              <Badge
                variant={page.status === "published" ? "default" : "outline"}
              >
                {page.status === "published"
                  ? m.siteStatusPublished()
                  : m.siteStatusDraft()}
              </Badge>
              <div className="flex gap-2">
                {page.status === "published" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() =>
                      mutation.mutate({
                        kind: "unpublish",
                        id: page.id,
                        expectedRevision: page.revision,
                      })
                    }
                  >
                    {m.siteUnpublish()}
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({
                          kind: "publish",
                          id: page.id,
                          expectedRevision: page.revision,
                        })
                      }
                    >
                      {m.sitePublish()}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={confirming === page.id ? "destructive" : "ghost"}
                      disabled={mutation.isPending}
                      onClick={() => {
                        if (confirming === page.id) {
                          setConfirming(undefined);
                          mutation.mutate({
                            kind: "delete",
                            id: page.id,
                            expectedRevision: page.revision,
                          });
                        } else setConfirming(page.id);
                      }}
                    >
                      {confirming === page.id
                        ? m.siteConfirmDelete()
                        : m.siteDelete()}
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
