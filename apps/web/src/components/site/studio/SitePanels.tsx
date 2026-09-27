import type {
  ChromeLink,
  FontId,
  Palette,
  SiteChrome,
  SiteTheme,
  ThemeId,
} from "@faridalms/domain/site-theme";
import type { EditorMedia } from "@faridalms/editor";

import {
  BUTTON_SHAPES,
  CARD_STYLES,
  DENSITIES,
  EMPHASES,
  EYEBROWS,
  FONTS,
  fontsFor,
  FOOTERS,
  HEADERS,
  HEADING_CASES,
  HEADING_SCALES,
  IMAGE_SHAPES,
  MOTIONS,
  PHOTO_TONES,
  paletteWarnings,
  RADII,
  resolveTheme,
  THEME_IDS,
  THEMES,
} from "@faridalms/domain/site-theme";
import {
  ArrowDown,
  ArrowUp,
  Plus,
  RotateCcw,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";

import { CheckboxRow } from "~/components/people/fields";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import type { Languages } from "./draft";

import { LOCALE_NAME } from "../format";
import { Disclosure, PanelGroup, Segmented, StudioField } from "./controls";
import { FilePick, useUpload } from "./fields";
import {
  BUTTON_LABEL,
  CARD_LABEL,
  CASE_LABEL,
  DENSITY_LABEL,
  EMPHASIS_LABEL,
  EYEBROW_LABEL,
  FOOTER_LABEL,
  HEADER_LABEL,
  MOTION_LABEL,
  PALETTE_LABEL,
  SCALE_LABEL,
  SCHEME_LABEL,
  SHAPE_LABEL,
  TONE_LABEL,
  THEME_HINT,
  THEME_LABEL,
} from "./labels";

const PALETTE_ROLES = [
  "canvas",
  "surface",
  "primary",
  "accent",
  "ink",
] as const satisfies readonly (keyof Palette)[];

function ThemeCard({
  id,
  selected,
  onPick,
}: {
  id: ThemeId;
  selected: boolean;
  onPick: () => void;
}) {
  const theme = THEMES[id];
  const heading = `"${FONTS[theme.fonts.headingLatin].family}", ${FONTS[theme.fonts.headingLatin].fallback}`;
  const arabic = `"${FONTS[theme.fonts.headingArabic].family}", ${FONTS[theme.fonts.headingArabic].fallback}`;
  const button =
    theme.button === "pill"
      ? 999
      : theme.button === "square"
        ? 0
        : Math.max(theme.radius, 6);
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={THEME_LABEL[id]()}
      onClick={onPick}
      className="grid grid-cols-[6.5rem_minmax(0,1fr)] overflow-hidden rounded-xl border text-start transition-shadow hover:shadow-md aria-pressed:border-primary aria-pressed:ring-2 aria-pressed:ring-primary/30"
    >
      <span
        aria-hidden
        className="grid content-center justify-items-start gap-2 p-3"
        style={{ background: theme.palette.canvas, color: theme.palette.ink }}
      >
        <span
          className="flex items-baseline gap-1.5 text-2xl leading-none font-semibold"
          style={{ color: theme.palette.primary }}
        >
          <span style={{ fontFamily: heading }}>Aa</span>
          <span style={{ fontFamily: arabic }}>أب</span>
        </span>
        <span
          className="h-5 w-14"
          style={{ background: theme.palette.primary, borderRadius: button }}
        />
      </span>
      <span className="grid content-center gap-1 px-3 py-2.5">
        <span className="text-sm font-semibold">{THEME_LABEL[id]()}</span>
        <span className="text-xs leading-4 text-muted-foreground">
          {THEME_HINT[id]()}
        </span>
        <span className="mt-0.5 flex gap-1">
          {Object.entries(theme.palette).map(([role, colour]) => (
            <span
              key={role}
              className="size-3.5 rounded-full border border-black/10"
              style={{ background: colour }}
            />
          ))}
        </span>
      </span>
    </button>
  );
}

const face = (font: FontId) => ({
  fontFamily: `"${FONTS[font].family}", ${FONTS[font].fallback}`,
});

function FontSelect({
  id,
  label,
  value,
  script,
  onChange,
}: {
  id: string;
  label: string;
  value: FontId;
  script: "latin" | "arabic";
  onChange: (font: FontId) => void;
}) {
  return (
    <StudioField id={id} label={label}>
      <Select value={value} onValueChange={(next) => next && onChange(next)}>
        <SelectTrigger id={id} className="w-full max-md:h-10">
          <SelectValue>
            <span style={face(value)}>
              {FONTS[value].family.replace(/ Variable$/, "")}
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {fontsFor(script).map((font) => (
            <SelectItem key={font} value={font}>
              <span style={face(font)}>
                {FONTS[font].family.replace(/ Variable$/, "")}
                {script === "arabic" ? " · أبجد هوز" : ""}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </StudioField>
  );
}

/**
 * The site's look, set once for every page: a theme, then the colours,
 * faces, shapes, header and footer a school changes on top of it.
 */
export function StylesPanel({
  theme,
  onChange,
}: {
  theme: SiteTheme;
  onChange: (next: SiteTheme, key?: string) => void;
}) {
  const resolved = resolveTheme(theme);
  const warnings = paletteWarnings(resolved.palette);
  const set = <K extends keyof SiteTheme>(key: K, value: SiteTheme[K]) =>
    onChange({ ...theme, [key]: value }, `theme:${key}`);
  return (
    <div>
      <PanelGroup title={m.siteThemes()} hint={m.siteThemesHint()}>
        <fieldset className="grid gap-2">
          <legend className="sr-only">{m.siteThemes()}</legend>
          {THEME_IDS.map((id) => (
            <ThemeCard
              key={id}
              id={id}
              selected={theme.id === id}
              onPick={() =>
                onChange({ id, palette: {}, fonts: {} }, "theme:id")
              }
            />
          ))}
        </fieldset>
      </PanelGroup>
      <PanelGroup
        title={m.siteColours()}
        action={
          Object.keys(theme.palette).length ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => set("palette", {})}
            >
              <RotateCcw aria-hidden />
              {m.siteResetToTheme()}
            </Button>
          ) : null
        }
      >
        <div className="grid gap-2">
          {PALETTE_ROLES.map((role) => (
            <div key={role} className="flex items-center gap-2">
              <input
                type="color"
                value={resolved.palette[role].toLowerCase()}
                aria-label={PALETTE_LABEL[role]()}
                onChange={(event) =>
                  onChange(
                    {
                      ...theme,
                      palette: {
                        ...theme.palette,
                        [role]: event.target.value.toUpperCase(),
                      },
                    },
                    `theme:palette:${role}`,
                  )
                }
                className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                {PALETTE_LABEL[role]()}
              </span>
              <span
                dir="ltr"
                className="font-mono text-xs text-muted-foreground uppercase"
              >
                {resolved.palette[role]}
              </span>
            </div>
          ))}
        </div>
        {warnings.length ? (
          <output className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2 text-[13px] leading-[18px] text-warning-foreground dark:text-warning">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {m.siteContrastWarning({
              schemes: warnings
                .map((scheme) => SCHEME_LABEL[scheme]())
                .join(", "),
            })}
          </output>
        ) : null}
      </PanelGroup>
      <PanelGroup
        title={m.siteFonts()}
        action={
          Object.keys(theme.fonts).length ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => set("fonts", {})}
            >
              <RotateCcw aria-hidden />
              {m.siteResetToTheme()}
            </Button>
          ) : null
        }
      >
        <FontSelect
          id="font-heading-latin"
          label={m.siteFontHeadingLatin()}
          value={resolved.fonts.headingLatin}
          script="latin"
          onChange={(font) =>
            set("fonts", { ...theme.fonts, headingLatin: font })
          }
        />
        <FontSelect
          id="font-body-latin"
          label={m.siteFontBodyLatin()}
          value={resolved.fonts.bodyLatin}
          script="latin"
          onChange={(font) => set("fonts", { ...theme.fonts, bodyLatin: font })}
        />
        <FontSelect
          id="font-heading-arabic"
          label={m.siteFontHeadingArabic()}
          value={resolved.fonts.headingArabic}
          script="arabic"
          onChange={(font) =>
            set("fonts", { ...theme.fonts, headingArabic: font })
          }
        />
        <FontSelect
          id="font-body-arabic"
          label={m.siteFontBodyArabic()}
          value={resolved.fonts.bodyArabic}
          script="arabic"
          onChange={(font) =>
            set("fonts", { ...theme.fonts, bodyArabic: font })
          }
        />
      </PanelGroup>
      <PanelGroup title={m.siteShape()}>
        <StudioField label={m.siteCorners()}>
          <Segmented
            label={m.siteCorners()}
            value={String(resolved.radius)}
            options={RADII.map((radius) => ({
              value: String(radius),
              label: formatNumber(radius),
            }))}
            onChange={(radius) =>
              set("radius", Number(radius) as SiteTheme["radius"])
            }
          />
        </StudioField>
        <StudioField label={m.siteButtons()}>
          <Segmented
            label={m.siteButtons()}
            value={resolved.button}
            options={BUTTON_SHAPES.map((value) => ({
              value,
              label: BUTTON_LABEL[value](),
            }))}
            onChange={(button) => set("button", button)}
          />
        </StudioField>
        <StudioField label={m.siteDensity()}>
          <Segmented
            label={m.siteDensity()}
            value={resolved.density}
            options={DENSITIES.map((value) => ({
              value,
              label: DENSITY_LABEL[value](),
            }))}
            onChange={(density) => set("density", density)}
          />
        </StudioField>
        <StudioField label={m.siteCardStyle()}>
          <Segmented
            label={m.siteCardStyle()}
            value={resolved.card}
            options={CARD_STYLES.map((value) => ({
              value,
              label: CARD_LABEL[value](),
            }))}
            onChange={(card) => set("card", card)}
          />
        </StudioField>
        <StudioField label={m.siteImageShape()} hint={m.siteImageShapeHint()}>
          <Segmented
            label={m.siteImageShape()}
            value={resolved.image}
            options={IMAGE_SHAPES.map((value) => ({
              value,
              label: SHAPE_LABEL[value](),
            }))}
            onChange={(image) => set("image", image)}
          />
        </StudioField>
        <StudioField label={m.sitePhotoTone()} hint={m.sitePhotoToneHint()}>
          <Segmented
            label={m.sitePhotoTone()}
            value={resolved.photoTone}
            options={PHOTO_TONES.map((value) => ({
              value,
              label: TONE_LABEL[value](),
            }))}
            onChange={(photoTone) => set("photoTone", photoTone)}
          />
        </StudioField>
      </PanelGroup>
      <PanelGroup title={m.siteTypography()}>
        <StudioField label={m.siteHeadingScale()}>
          <Segmented
            label={m.siteHeadingScale()}
            value={resolved.headingScale}
            options={HEADING_SCALES.map((value) => ({
              value,
              label: SCALE_LABEL[value](),
            }))}
            onChange={(headingScale) => set("headingScale", headingScale)}
          />
        </StudioField>
        <StudioField label={m.siteHeadingCase()} hint={m.siteHeadingCaseHint()}>
          <Segmented
            label={m.siteHeadingCase()}
            value={resolved.headingCase}
            options={HEADING_CASES.map((value) => ({
              value,
              label: CASE_LABEL[value](),
            }))}
            onChange={(headingCase) => set("headingCase", headingCase)}
          />
        </StudioField>
        <StudioField label={m.siteEmphasisStyle()} hint={m.siteEmphasisHint()}>
          <Segmented
            label={m.siteEmphasisStyle()}
            value={resolved.emphasis}
            options={EMPHASES.map((value) => ({
              value,
              label: EMPHASIS_LABEL[value](),
            }))}
            onChange={(emphasis) => set("emphasis", emphasis)}
          />
        </StudioField>
        <StudioField label={m.siteEyebrowStyle()}>
          <Segmented
            label={m.siteEyebrowStyle()}
            value={resolved.eyebrow}
            options={EYEBROWS.map((value) => ({
              value,
              label: EYEBROW_LABEL[value](),
            }))}
            onChange={(eyebrow) => set("eyebrow", eyebrow)}
          />
        </StudioField>
      </PanelGroup>
      <PanelGroup title={m.siteMotionLevel()} hint={m.siteMotionHint()}>
        <Segmented
          label={m.siteMotionLevel()}
          value={resolved.motion}
          options={MOTIONS.map((value) => ({
            value,
            label: MOTION_LABEL[value](),
          }))}
          onChange={(motion) => set("motion", motion)}
        />
      </PanelGroup>
      <PanelGroup title={m.siteHeaderAndFooter()}>
        <StudioField label={m.siteHeaderStyle()}>
          <Segmented
            label={m.siteHeaderStyle()}
            value={resolved.header}
            options={HEADERS.map((value) => ({
              value,
              label: HEADER_LABEL[value](),
            }))}
            onChange={(header) => set("header", header)}
          />
        </StudioField>
        <StudioField label={m.siteFooterStyle()}>
          <Segmented
            label={m.siteFooterStyle()}
            value={resolved.footer}
            options={FOOTERS.map((value) => ({
              value,
              label: FOOTER_LABEL[value](),
            }))}
            onChange={(footer) => set("footer", footer)}
          />
        </StudioField>
      </PanelGroup>
    </div>
  );
}

function Bilingual({
  id,
  label,
  value,
  languages,
  max,
  onChange,
}: {
  id: string;
  label: string;
  value: { en: string; ar: string };
  languages: Languages;
  max: number;
  onChange: (value: { en: string; ar: string }) => void;
}) {
  const locales = languages.other
    ? [languages.primary, languages.other]
    : [languages.primary];
  return (
    <div className="grid gap-1.5">
      {locales.map((locale) => (
        <Input
          key={locale}
          id={`${id}-${locale}`}
          value={value[locale]}
          maxLength={max}
          lang={locale}
          dir={locale === "ar" ? "rtl" : "ltr"}
          aria-label={m.siteFieldIn({
            field: label,
            language: LOCALE_NAME[locale](),
          })}
          placeholder={languages.other ? LOCALE_NAME[locale]() : label}
          className="max-md:h-10"
          onChange={(event) =>
            onChange({ ...value, [locale]: event.target.value })
          }
        />
      ))}
    </div>
  );
}

function moved<T>(items: T[], index: number, by: -1 | 1): T[] {
  const next = [...items];
  const [item] = next.splice(index, 1);
  if (item !== undefined) next.splice(index + by, 0, item);
  return next;
}

function LinkList<T extends ChromeLink>({
  id,
  links,
  max,
  languages,
  pages,
  make,
  onChange,
}: {
  id: string;
  links: T[];
  max: number;
  languages: Languages;
  pages: { href: string; title: string }[];
  make: () => T;
  onChange: (links: T[]) => void;
}) {
  const list = `${id}-pages`;
  return (
    <div className="grid gap-2">
      <datalist id={list}>
        {pages.map((page) => (
          <option key={page.href} value={page.href}>
            {page.title}
          </option>
        ))}
      </datalist>
      {links.map((link, index) => {
        const set = (next: T) =>
          onChange(links.map((item, at) => (at === index ? next : item)));
        return (
          <div
            key={link.id}
            className="grid gap-2 rounded-lg border bg-card p-2.5"
          >
            <Bilingual
              id={`${id}-${link.id}`}
              label={m.siteLinkWords()}
              value={link.label}
              languages={languages}
              max={40}
              onChange={(label) => set({ ...link, label })}
            />
            <Input
              value={link.href}
              list={list}
              dir="ltr"
              placeholder={m.siteLinkPlaceholder()}
              aria-label={m.siteLinkTarget()}
              className="max-md:h-10"
              onChange={(event) =>
                set({ ...link, href: event.target.value.trim() })
              }
            />
            <div className="flex items-center gap-1">
              {"style" in link &&
              (link.style === "primary" || link.style === "secondary") ? (
                <Segmented
                  label={m.siteButtonStyle()}
                  value={link.style}
                  options={[
                    { value: "primary", label: m.siteButtonPrimary() },
                    { value: "secondary", label: m.siteButtonSecondary() },
                  ]}
                  onChange={(style) => set({ ...link, style })}
                  className="flex-none"
                />
              ) : null}
              <span className="ms-auto flex gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={m.siteMoveUpItem({
                    item:
                      link.label[languages.primary] ||
                      m.siteItemNumber({ number: formatNumber(index + 1) }),
                  })}
                  disabled={index === 0}
                  onClick={() => onChange(moved(links, index, -1))}
                >
                  <ArrowUp aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={m.siteMoveDownItem({
                    item:
                      link.label[languages.primary] ||
                      m.siteItemNumber({ number: formatNumber(index + 1) }),
                  })}
                  disabled={index === links.length - 1}
                  onClick={() => onChange(moved(links, index, 1))}
                >
                  <ArrowDown aria-hidden />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={m.siteRemoveItem({
                    item:
                      link.label[languages.primary] ||
                      m.siteItemNumber({ number: formatNumber(index + 1) }),
                  })}
                  onClick={() =>
                    onChange(links.filter((_, at) => at !== index))
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
              </span>
            </div>
          </div>
        );
      })}
      {links.length < max ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start max-md:h-10"
          onClick={() => onChange([...links, make()])}
        >
          <Plus aria-hidden />
          {m.siteAddLink()}
        </Button>
      ) : null}
    </div>
  );
}

const blank = () => ({ en: "", ar: "" });

/** The frame every page shares: logo, the links above the menu, the actions beside it, the footer and the phone dock. */
export function FramePanel({
  chrome,
  languages,
  pages,
  media,
  logoUrl,
  onChange,
}: {
  chrome: SiteChrome;
  languages: Languages;
  pages: { href: string; title: string }[];
  media: EditorMedia;
  logoUrl: string | null;
  onChange: (next: SiteChrome, key?: string) => void;
}) {
  const { busy, upload } = useUpload(media);
  const set = <K extends keyof SiteChrome>(key: K, value: SiteChrome[K]) =>
    onChange({ ...chrome, [key]: value }, `chrome:${key}`);
  return (
    <div>
      <PanelGroup title={m.siteLogo()} hint={m.siteLogoHint()}>
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-28 place-items-center overflow-hidden rounded-md border bg-muted">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt=""
                className="max-h-full max-w-full object-contain"
              />
            ) : null}
          </div>
          <FilePick
            accept={media.accept.image}
            label={chrome.logoFileId ? m.siteReplace() : m.siteUpload()}
            busy={busy}
            onFile={(file) =>
              void upload(file, (logoFileId) => set("logoFileId", logoFileId))
            }
          />
          {chrome.logoFileId ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="max-md:size-10"
              aria-label={m.siteRemoveLogo()}
              onClick={() => set("logoFileId", null)}
            >
              <X aria-hidden />
            </Button>
          ) : null}
        </div>
      </PanelGroup>
      <PanelGroup
        title={m.siteHeaderActions()}
        hint={m.siteHeaderActionsHint()}
      >
        <LinkList
          id="chrome-actions"
          links={chrome.actions}
          max={3}
          languages={languages}
          pages={pages}
          make={() => ({
            id: crypto.randomUUID(),
            label: blank(),
            href: "",
            style: "secondary" as const,
          })}
          onChange={(actions) => set("actions", actions)}
        />
        <CheckboxRow
          label={m.siteDock()}
          hint={m.siteDockHint()}
          checked={chrome.dock}
          onChange={(dock) => set("dock", dock)}
        />
      </PanelGroup>
      <PanelGroup title={m.siteUtilityLinks()} hint={m.siteUtilityLinksHint()}>
        <LinkList
          id="chrome-utility"
          links={chrome.utility}
          max={6}
          languages={languages}
          pages={pages}
          make={() => ({ id: crypto.randomUUID(), label: blank(), href: "" })}
          onChange={(utility) => set("utility", utility)}
        />
      </PanelGroup>
      <PanelGroup
        title={m.siteFooterColumns()}
        hint={m.siteFooterColumnsHint()}
      >
        <div className="grid gap-2">
          {chrome.footerColumns.map((column, index) => (
            <Disclosure
              key={column.id}
              summary={
                column.title[languages.primary] ||
                m.siteColumnNumber({ number: formatNumber(index + 1) })
              }
              actions={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={m.siteRemoveItem({
                    item:
                      column.title[languages.primary] ||
                      m.siteColumnNumber({ number: formatNumber(index + 1) }),
                  })}
                  onClick={(event) => {
                    event.preventDefault();
                    set(
                      "footerColumns",
                      chrome.footerColumns.filter((_, at) => at !== index),
                    );
                  }}
                >
                  <Trash2 aria-hidden />
                </Button>
              }
            >
              <StudioField label={m.siteColumnTitle()}>
                <Bilingual
                  id={`column-${column.id}`}
                  label={m.siteColumnTitle()}
                  value={column.title}
                  languages={languages}
                  max={60}
                  onChange={(title) =>
                    set(
                      "footerColumns",
                      chrome.footerColumns.map((item, at) =>
                        at === index ? { ...item, title } : item,
                      ),
                    )
                  }
                />
              </StudioField>
              <LinkList
                id={`column-${column.id}-links`}
                links={column.links}
                max={8}
                languages={languages}
                pages={pages}
                make={() => ({
                  id: crypto.randomUUID(),
                  label: blank(),
                  href: "",
                })}
                onChange={(links) =>
                  set(
                    "footerColumns",
                    chrome.footerColumns.map((item, at) =>
                      at === index ? { ...item, links } : item,
                    ),
                  )
                }
              />
            </Disclosure>
          ))}
          {chrome.footerColumns.length < 4 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-self-start max-md:h-10"
              onClick={() =>
                set("footerColumns", [
                  ...chrome.footerColumns,
                  { id: crypto.randomUUID(), title: blank(), links: [] },
                ])
              }
            >
              <Plus aria-hidden />
              {m.siteAddColumn()}
            </Button>
          ) : null}
        </div>
      </PanelGroup>
      <PanelGroup title={m.siteFooterNote()} hint={m.siteFooterNoteHint()}>
        <Bilingual
          id="footer-note"
          label={m.siteFooterNote()}
          value={chrome.footerNote}
          languages={languages}
          max={300}
          onChange={(footerNote) => set("footerNote", footerNote)}
        />
      </PanelGroup>
    </div>
  );
}
