import type { SchoolPage } from "@faridalms/domain/site-starters";
import type { SiteModules, StarterId } from "@faridalms/domain/site-templates";

import { reviewStarter } from "@faridalms/domain/site-starters";
import { STARTERS } from "@faridalms/domain/site-templates";
import { Button } from "@faridalms/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@faridalms/ui/system/dialog";
import { Segmented } from "@faridalms/ui/system/panel";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, History } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "~/components/people/fields";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { applySiteStarter } from "~/server/site";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import { STARTER_LABEL } from "./studio/labels";

type Choice = "keep" | "replace";

export interface StarterReviewProps {
  starter: StarterId | null;
  modules: SiteModules;
  pages: SchoolPage[];
  onOpenChange: (open: boolean) => void;
}

/**
 * What using a ready-made site does, page by page, before it is done: each
 * of its pages is new, or meets a page the school has at its address, which
 * the school keeps (the default) or replaces with the starter's as a draft.
 * A replaced page's words go to its history, and its published copy stays
 * on the site until the draft is published.
 */
export function StarterReview({
  starter,
  modules,
  pages,
  onOpenChange,
}: StarterReviewProps) {
  const queryClient = useQueryClient();
  const [withTheme, setWithTheme] = useState(true);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const rows = starter ? reviewStarter(STARTERS[starter], modules, pages) : [];
  const titleAt = getLocale() === "ar" ? 1 : 0;
  const replace = rows
    .filter(
      (row) => row.fate === "taken" && choices[row.page.slug] === "replace",
    )
    .map((row) => row.page.slug);
  const close = (open: boolean) => {
    if (!open) {
      setChoices({});
      setWithTheme(true);
    }
    onOpenChange(open);
  };
  const apply = useMutation({
    mutationFn: (chosen: StarterId) =>
      applySiteStarter({ data: { starter: chosen, withTheme, replace } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["site"] });
      toast.success(
        m.siteStarterApplied({
          count: result.created.length,
          value: formatNumber(result.created.length),
        }),
      );
      if (result.replaced.length)
        toast.success(
          m.siteStarterReplaced({
            count: result.replaced.length,
            value: formatNumber(result.replaced.length),
          }),
        );
      close(false);
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <Dialog open={starter !== null} onOpenChange={close}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {starter
              ? m.siteStarterReviewTitle({ starter: STARTER_LABEL[starter]() })
              : null}
          </DialogTitle>
          <DialogDescription>{m.siteStarterReviewHint()}</DialogDescription>
        </DialogHeader>
        <ul
          aria-label={m.siteStarterReviewPages()}
          className="grid divide-y rounded-lg border"
        >
          {rows.map((row) => {
            const title = row.page.title[titleAt];
            const address = row.page.home ? "/" : `/pages/${row.page.slug}`;
            return (
              <li
                key={row.page.slug}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
              >
                <div className="grid min-w-0 gap-0.5">
                  <span className="font-medium">{title}</span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    <span dir="ltr">{address}</span>
                    {" · "}
                    {row.fate === "new"
                      ? m.siteStarterPageNew()
                      : row.fate === "taken"
                        ? m.siteStarterPageTaken()
                        : m.siteStarterLeftOut()}
                  </span>
                </div>
                {row.fate === "taken" ? (
                  <Segmented
                    label={m.siteStarterPageChoice({ page: title })}
                    value={choices[row.page.slug] ?? "keep"}
                    options={[
                      { value: "keep", label: m.siteStarterKeep() },
                      { value: "replace", label: m.siteStarterReplace() },
                    ]}
                    onChange={(choice) =>
                      setChoices((current) => ({
                        ...current,
                        [row.page.slug]: choice,
                      }))
                    }
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
        {rows.some((row) => row.fate === "taken") ? (
          <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-[13px] leading-[18px]">
            <History aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{m.siteStarterReplaceKept()}</span>
          </p>
        ) : null}
        {pages.length > 0 ? (
          <CheckboxRow
            label={m.siteStarterWithTheme()}
            hint={m.siteStarterWithThemeHint()}
            checked={withTheme}
            onChange={setWithTheme}
          />
        ) : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-10"
            onClick={() => close(false)}
          >
            {m.commonCancel()}
          </Button>
          <Button
            type="button"
            className="max-md:h-10"
            disabled={apply.isPending || !starter}
            onClick={() => {
              if (starter) apply.mutate(starter);
            }}
          >
            <Check aria-hidden />
            {replace.length
              ? m.siteStarterApplyReplacing({
                  count: replace.length,
                  value: formatNumber(replace.length),
                })
              : m.siteUseStarter()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
