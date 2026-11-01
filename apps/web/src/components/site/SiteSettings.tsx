import type {
  BannerTone,
  SiteLocale,
  SocialKind,
} from "@faridalms/domain/website";

import {
  BANNER_TONES,
  SITE_LOCALES,
  SOCIAL_KINDS,
} from "@faridalms/domain/website";
import { Button } from "@faridalms/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { siteOverviewQuery } from "~/queries/site";

import { LOCALE_NAME } from "~/components/content/languages";
import { CheckboxRow } from "~/components/people/fields";
import { SelectField, TextField } from "~/components/system/field";
import {
  SettingsPage,
  SettingsSection,
} from "~/components/system/SettingsSection";
import * as m from "~/i18n/messages";
import { saveSiteSettings } from "~/server/site";
import { instantFromLocal, localInput } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

type Settings = Awaited<
  ReturnType<NonNullable<(typeof siteOverviewQuery)["queryFn"]>>
>["settings"];

const SOCIAL_LABEL: Record<SocialKind, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
};

const TONE_LABEL: Record<BannerTone, () => string> = {
  info: m.siteToneInfo,
  warning: m.siteToneWarning,
  danger: m.siteToneDanger,
};

interface Draft {
  live: boolean;
  primaryLocale: SiteLocale;
  bilingual: boolean;
  taglineEn: string;
  taglineAr: string;
  socialLinks: { kind: SocialKind; url: string }[];
  bannerEn: string;
  bannerAr: string;
  bannerTone: BannerTone;
  bannerUntil: string;
}

function draftOf(settings: Settings): Draft {
  return {
    live: settings.live,
    primaryLocale: settings.primaryLocale,
    bilingual: settings.bilingual,
    taglineEn: settings.taglineEn,
    taglineAr: settings.taglineAr,
    socialLinks: settings.socialLinks,
    bannerEn: settings.bannerEn,
    bannerAr: settings.bannerAr,
    bannerTone: settings.bannerTone,
    bannerUntil: localInput(settings.bannerUntil),
  };
}

const GROUPS = {
  site: ["live", "primaryLocale", "bilingual", "taglineEn", "taglineAr"],
  social: ["socialLinks"],
  banner: ["bannerEn", "bannerAr", "bannerTone", "bannerUntil"],
} as const satisfies Record<string, readonly (keyof Draft)[]>;

/** The website as a whole: whether it is live, its languages, links and banner. */
export function SiteSettings({ settings }: { settings: Settings }) {
  const queryClient = useQueryClient();
  const initial = draftOf(settings);
  const [draft, setDraft] = useState(initial);
  const [saved, setSaved] = useState<keyof typeof GROUPS | null>(null);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setSaved(null);
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const save = useMutation({
    mutationFn: () =>
      saveSiteSettings({
        data: {
          ...draft,
          theme: settings.theme,
          chrome: settings.chrome,
          expectedVersion: settings.version,
          socialLinks: draft.socialLinks.filter((link) => link.url.trim()),
          bannerUntil: instantFromLocal(draft.bannerUntil),
        },
      }),
  });
  const dirty = (group: keyof typeof GROUPS) => () =>
    GROUPS[group].some(
      (key) => JSON.stringify(draft[key]) !== JSON.stringify(initial[key]),
    );
  const submit = (group: keyof typeof GROUPS) => async () => {
    try {
      await save.mutateAsync();
    } catch {
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ["site"] });
    setSaved(group);
    toast.success(m.siteSettingsSaved());
  };
  const error = save.error ? getMessageFromError(save.error) : null;
  const localeOptions = SITE_LOCALES.map((locale) => ({
    value: locale,
    label: LOCALE_NAME[locale](),
  }));
  return (
    <SettingsPage>
      <SettingsSection
        title={m.siteSettingsSite()}
        description={m.siteSettingsSiteHint()}
        onSubmit={submit("site")}
        pending={save.isPending}
        error={error}
        saved={saved === "site"}
        isDirty={dirty("site")}
      >
        <CheckboxRow
          label={m.siteLive()}
          hint={m.siteLiveHint()}
          checked={draft.live}
          onChange={(live) => set("live", live)}
        />
        <SelectField
          id="site-primary-locale"
          label={m.sitePrimaryLocale()}
          hint={m.sitePrimaryLocaleHint()}
          width="date"
          value={draft.primaryLocale}
          options={localeOptions}
          onChange={(primaryLocale) => set("primaryLocale", primaryLocale)}
        />
        <CheckboxRow
          label={m.siteBilingual()}
          hint={m.siteBilingualHint()}
          checked={draft.bilingual}
          onChange={(bilingual) => set("bilingual", bilingual)}
        />
        <TextField
          id="site-tagline-en"
          label={m.siteTaglineEn()}
          width="name"
          dir="ltr"
          lang="en"
          maxLength={200}
          value={draft.taglineEn}
          onChange={(event) => set("taglineEn", event.target.value)}
        />
        <TextField
          id="site-tagline-ar"
          label={m.siteTaglineAr()}
          width="name"
          dir="rtl"
          lang="ar"
          maxLength={200}
          value={draft.taglineAr}
          onChange={(event) => set("taglineAr", event.target.value)}
        />
      </SettingsSection>
      <SettingsSection
        title={m.siteSettingsSocial()}
        description={m.siteSettingsSocialHint()}
        onSubmit={submit("social")}
        pending={save.isPending}
        error={error}
        saved={saved === "social"}
        isDirty={dirty("social")}
      >
        <ul className="grid gap-4">
          {draft.socialLinks.map((link, index) => (
            <li
              key={index}
              className="grid items-end gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto]"
            >
              <SelectField
                id={`site-social-${index}-kind`}
                label={m.siteSocialKind()}
                value={link.kind}
                options={SOCIAL_KINDS.map((kind) => ({
                  value: kind,
                  label: SOCIAL_LABEL[kind],
                }))}
                onChange={(kind) =>
                  set(
                    "socialLinks",
                    draft.socialLinks.map((item, at) =>
                      at === index ? { ...item, kind } : item,
                    ),
                  )
                }
              />
              <TextField
                id={`site-social-${index}-url`}
                label={m.siteSocialUrl({ kind: SOCIAL_LABEL[link.kind] })}
                type="url"
                dir="ltr"
                placeholder="https://"
                value={link.url}
                onChange={(event) =>
                  set(
                    "socialLinks",
                    draft.socialLinks.map((item, at) =>
                      at === index
                        ? { ...item, url: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="max-md:size-10"
                aria-label={m.siteRemoveSocial({
                  kind: SOCIAL_LABEL[link.kind],
                })}
                onClick={() =>
                  set(
                    "socialLinks",
                    draft.socialLinks.filter((_, at) => at !== index),
                  )
                }
              >
                <X aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
        {draft.socialLinks.length < 10 ? (
          <div>
            <Button
              type="button"
              variant="outline"
              className="max-md:h-10"
              onClick={() =>
                set("socialLinks", [
                  ...draft.socialLinks,
                  { kind: "facebook", url: "" },
                ])
              }
            >
              <Plus aria-hidden />
              {m.siteAddSocial()}
            </Button>
          </div>
        ) : null}
      </SettingsSection>
      <SettingsSection
        title={m.siteSettingsBanner()}
        description={m.siteSettingsBannerHint()}
        onSubmit={submit("banner")}
        pending={save.isPending}
        error={error}
        saved={saved === "banner"}
        isDirty={dirty("banner")}
      >
        <TextField
          id="site-banner-en"
          label={m.siteBannerEn()}
          width="name"
          dir="ltr"
          lang="en"
          maxLength={300}
          value={draft.bannerEn}
          onChange={(event) => set("bannerEn", event.target.value)}
        />
        <TextField
          id="site-banner-ar"
          label={m.siteBannerAr()}
          width="name"
          dir="rtl"
          lang="ar"
          maxLength={300}
          value={draft.bannerAr}
          onChange={(event) => set("bannerAr", event.target.value)}
        />
        <SelectField
          id="site-banner-tone"
          label={m.siteBannerTone()}
          width="date"
          value={draft.bannerTone}
          options={BANNER_TONES.map((tone) => ({
            value: tone,
            label: TONE_LABEL[tone](),
          }))}
          onChange={(bannerTone) => set("bannerTone", bannerTone)}
        />
        <TextField
          id="site-banner-until"
          label={m.siteBannerUntil()}
          hint={m.siteBannerUntilHint()}
          type="datetime-local"
          width="reference"
          optional
          value={draft.bannerUntil}
          onChange={(event) => set("bannerUntil", event.target.value)}
        />
      </SettingsSection>
    </SettingsPage>
  );
}
