import type { SiteLocale } from "@faridalms/domain/site-sections";
import type { StarterId } from "@faridalms/domain/site-templates";

import {
  buildTemplate,
  STARTER_IDS,
  STARTERS,
} from "@faridalms/domain/site-templates";
import { resolveTheme, THEMES } from "@faridalms/domain/site-theme";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "~/components/people/fields";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { applySiteStarter } from "~/server/site";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

import type { NewsItem, SiteContact } from "./render/parts";

import { PageSections } from "./render/page";
import { Viewport } from "./studio/Canvas";
import { STARTER_HINT, STARTER_LABEL, THEME_LABEL } from "./studio/labels";

function StarterCard({
  starter,
  locale,
  school,
  news,
  contact,
  pending,
  onUse,
}: {
  starter: StarterId;
  locale: SiteLocale;
  school: string;
  news: NewsItem[];
  contact: SiteContact;
  pending: boolean;
  onUse: () => void;
}) {
  const plan = STARTERS[starter];
  const home = plan.pages.find((page) => page.home) ?? plan.pages[0];
  const sections = useMemo(
    () => (home ? buildTemplate(home.template, locale).content : []),
    [home, locale],
  );
  const theme = resolveTheme({ id: plan.theme, palette: {}, fonts: {} });
  return (
    <li className="grid content-start overflow-hidden rounded-xl border bg-card shadow-xs">
      <div
        aria-hidden
        inert
        className="pointer-events-none h-64 overflow-hidden border-b bg-white"
      >
        <Viewport
          width={1280}
          theme={theme}
          locale={locale}
          scale={0.3}
          fit={false}
        >
          <PageSections
            sections={sections.map((section) => ({ section, locale }))}
            title=""
            context={{
              school,
              locale,
              theme,
              fileUrl: () => null,
              news,
              contact,
              editing: true,
            }}
          />
        </Viewport>
      </div>
      <div className="grid gap-3 p-4">
        <div className="grid gap-1">
          <h3 className="font-semibold">{STARTER_LABEL[starter]()}</h3>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {STARTER_HINT[starter]()}
          </p>
        </div>
        <p className="text-[13px] text-muted-foreground">
          {m.siteStarterTheme({ theme: THEME_LABEL[plan.theme]() })} ·{" "}
          {m.siteStarterPages({
            count: plan.pages.length,
            value: formatNumber(plan.pages.length),
          })}
        </p>
        <div className="flex gap-1">
          {Object.values(THEMES[plan.theme].palette).map((colour) => (
            <span
              key={colour}
              className="size-4 rounded-full border border-black/10"
              style={{ background: colour }}
            />
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          className="justify-self-start max-md:h-10"
          disabled={pending}
          onClick={onUse}
        >
          <Check aria-hidden />
          {m.siteUseStarter()}
        </Button>
      </div>
    </li>
  );
}

/**
 * Whole sites to start from: each a theme and a set of pages with sample
 * words in both languages, drafted for the school to rewrite. Pages whose
 * address is already taken are left alone.
 */
export function Starters({
  locale,
  school,
  news,
  contact,
  hasPages,
}: {
  locale: SiteLocale;
  school: string;
  news: NewsItem[];
  contact: SiteContact;
  hasPages: boolean;
}) {
  const queryClient = useQueryClient();
  const [withTheme, setWithTheme] = useState(true);
  const apply = useMutation({
    mutationFn: (starter: StarterId) =>
      applySiteStarter({ data: { starter, withTheme } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["site"] });
      toast.success(
        m.siteStarterApplied({
          count: result.created.length,
          value: formatNumber(result.created.length),
        }),
      );
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <div className="grid gap-4">
      {hasPages ? (
        <CheckboxRow
          label={m.siteStarterWithTheme()}
          hint={m.siteStarterWithThemeHint()}
          checked={withTheme}
          onChange={setWithTheme}
        />
      ) : null}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {STARTER_IDS.map((starter) => (
          <StarterCard
            key={starter}
            starter={starter}
            locale={locale}
            school={school}
            news={news}
            contact={contact}
            pending={apply.isPending}
            onUse={() => apply.mutate(starter)}
          />
        ))}
      </ul>
    </div>
  );
}
