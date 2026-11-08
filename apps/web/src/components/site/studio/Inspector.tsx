import type {
  PageSection,
  SectionStyle,
  SiteIssueCode,
  SiteLocale,
} from "@faridalms/domain/site-sections";
import type { SchemeId } from "@faridalms/domain/site-theme";
import type { ReactNode } from "react";

import {
  fitColumns,
  PATTERNS,
  SECTION_SPECS,
  shownFields,
} from "@faridalms/domain/site-sections";
import { DIVIDERS, SCHEMES, schemesOf } from "@faridalms/domain/site-theme";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Input } from "@faridalms/ui/input";
import { PanelGroup, Segmented } from "@faridalms/ui/system/panel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@faridalms/ui/tabs";
import {
  AlignCenter,
  AlignLeft,
  BookmarkPlus,
  CircleAlert,
  X,
} from "lucide-react";

import { LOCALE_NAME } from "~/components/content/languages";
import { CheckboxRow } from "~/components/people/fields";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import type { RenderContext } from "../render/parts";
import type { Languages } from "./draft";
import type { FieldContext } from "./fields";

import { SiteSection } from "../render/sections";
import { Viewport } from "./Canvas";
import { StudioField } from "./controls";
import { FieldControl, FilePick, FocusPicker, useUpload } from "./fields";
import {
  ALIGN_LABEL,
  DIVIDER_LABEL,
  ISSUE_LABEL,
  PATTERN_LABEL,
  SCHEME_LABEL,
  SECTION_HINT,
  SECTION_LABEL,
  SPACING_LABEL,
  VARIANT_LABEL,
  WIDTH_LABEL,
} from "./labels";

interface VariantPickerProps {
  section: PageSection;
  context: RenderContext;
  onChange: (variant: string) => void;
}

function VariantPicker({ section, context, onChange }: VariantPickerProps) {
  const variants = SECTION_SPECS[section.type].variants as readonly string[];
  const labels = VARIANT_LABEL[section.type] as Record<string, () => string>;
  return (
    <fieldset className="grid grid-cols-2 gap-2">
      <legend className="sr-only">{m.siteLayout()}</legend>
      {variants.map((variant) => (
        <div
          key={variant}
          className={cn(
            "relative grid overflow-hidden rounded-lg border bg-card text-start",
            section.variant === variant &&
              "border-primary ring-2 ring-primary/30",
          )}
        >
          <button
            type="button"
            aria-pressed={section.variant === variant}
            aria-label={labels[variant]?.()}
            onClick={() => onChange(variant)}
            className="absolute inset-0 z-10 rounded-lg focus-visible:outline-2 focus-visible:outline-primary"
          />
          <div
            aria-hidden
            inert
            className="pointer-events-none h-24 overflow-hidden border-b bg-white"
          >
            <Viewport
              width={1200}
              theme={context.theme}
              locale={context.locale}
            >
              <SiteSection
                section={{ ...section, variant } as PageSection}
                shownIn={context.locale}
                context={context}
                first={false}
              />
            </Viewport>
          </div>
          <span className="px-2 py-1.5 text-xs font-medium">
            {labels[variant]?.()}
          </span>
        </div>
      ))}
    </fieldset>
  );
}

interface SchemePickerProps {
  value: SchemeId;
  context: RenderContext;
  onChange: (scheme: SchemeId) => void;
}

function SchemePicker({ value, context, onChange }: SchemePickerProps) {
  const schemes = schemesOf(context.theme.palette);
  return (
    <fieldset className="grid grid-cols-5 gap-1.5">
      <legend className="sr-only">{m.siteColourScheme()}</legend>
      {SCHEMES.map((scheme) => (
        <button
          key={scheme}
          type="button"
          aria-pressed={value === scheme}
          aria-label={SCHEME_LABEL[scheme]()}
          title={SCHEME_LABEL[scheme]()}
          onClick={() => onChange(scheme)}
          className="grid aspect-square place-items-center rounded-lg border text-sm font-semibold aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-2 aria-pressed:ring-offset-background"
          style={{
            background: schemes[scheme].background,
            color: schemes[scheme].heading,
          }}
        >
          <span aria-hidden>Aa</span>
        </button>
      ))}
    </fieldset>
  );
}

export interface InspectorProps {
  section: PageSection;
  shown: PageSection;
  locale: SiteLocale;
  languages: Languages;
  fieldContext: FieldContext;
  renderContext: RenderContext;
  issues: SiteIssueCode[];
  reviewed: boolean;
  onChange: (next: PageSection, key?: string) => void;
  onWords: (next: PageSection, key?: string) => void;
  onReviewed: (reviewed: boolean) => void;
  onClose: () => void;
  /** Shown above the settings, such as what a shared section is and where it shows. */
  notice?: ReactNode;
  /** The settings show but cannot change, as for a shared section kept by someone else. */
  readOnly?: boolean;
  /** Keeps the section to use again; offered where it is not shared already. */
  onKeep?: () => void;
}

/**
 * The selected section's settings: its words and pictures, its layout and
 * its look. In the other language only its words change; everything else
 * follows the original so the two cannot drift apart.
 */
export function Inspector({
  section,
  shown,
  locale,
  languages,
  fieldContext,
  renderContext,
  issues,
  reviewed,
  onChange,
  onWords,
  onReviewed,
  onClose,
  notice,
  readOnly = false,
  onKeep,
}: InspectorProps) {
  const uploading = useUpload(fieldContext.media);
  const wordsOnly = fieldContext.wordsOnly;
  const otherLocale = languages.other;
  const target = wordsOnly ? shown : section;
  const setData = (key: string, value: unknown) => {
    const data: Record<string, unknown> = { ...target.data, [key]: value };
    if (target.type === "blocks" && key === "layout")
      data.columns = fitColumns(target.data.columns, String(value));
    const next = { ...target, data } as PageSection;
    if (wordsOnly) onWords(next, `${section.id}:${key}`);
    else onChange(next, `${section.id}:${key}`);
  };
  const setStyle = <K extends keyof SectionStyle>(
    key: K,
    value: SectionStyle[K],
  ) =>
    onChange(
      { ...section, style: { ...section.style, [key]: value } },
      `${section.id}:style:${key}`,
    );
  const style = section.style;
  const background = style.background;
  const content = (
    <div className="grid gap-4 px-4 py-4">
      {wordsOnly ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-[13px] leading-[18px] text-muted-foreground">
          {m.siteWordsOnlyHint({
            language: LOCALE_NAME[locale](),
            original: LOCALE_NAME[languages.primary](),
          })}
        </p>
      ) : null}
      {shownFields(section).map(([key, field]) => (
        <FieldControl
          key={`${locale}-${key}`}
          name={key}
          field={field}
          value={(target.data as Record<string, unknown>)[key]}
          context={fieldContext}
          prefix={`${section.id}-${locale}`}
          onChange={(value) => setData(key, value)}
        />
      ))}
      {wordsOnly ? (
        <div className="rounded-lg border p-3">
          <CheckboxRow
            label={m.siteReviewed({ language: LOCALE_NAME[locale]() })}
            hint={m.siteReviewedHint()}
            checked={reviewed}
            onChange={onReviewed}
          />
        </div>
      ) : null}
    </div>
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-2 border-b px-4 py-3">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 className="text-base font-semibold">
            {SECTION_LABEL[section.type]()}
          </h2>
          <p className="text-[13px] leading-[18px] text-muted-foreground">
            {SECTION_HINT[section.type]()}
          </p>
        </div>
        {onKeep ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="max-md:size-10"
            aria-label={m.siteSaveSectionTitle()}
            title={m.siteSaveSectionTitle()}
            onClick={onKeep}
          >
            <BookmarkPlus aria-hidden />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="max-md:size-10"
          aria-label={m.siteCloseInspector()}
          onClick={onClose}
        >
          <X aria-hidden />
        </Button>
      </div>
      {notice}
      {issues.length ? (
        <ul className="grid gap-1 border-b bg-destructive/5 px-4 py-2.5 text-[13px] leading-[18px] text-destructive">
          {issues.map((code) => (
            <li key={code} className="flex items-start gap-2">
              <CircleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {ISSUE_LABEL[code]()}
            </li>
          ))}
        </ul>
      ) : null}
      {wordsOnly ? (
        <div inert={readOnly} className="min-h-0 flex-1 overflow-y-auto">
          {content}
        </div>
      ) : readOnly ? (
        <div inert className="min-h-0 flex-1 overflow-y-auto">
          {content}
        </div>
      ) : (
        <Tabs
          defaultValue="content"
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <TabsList className="mx-4 mt-3 w-auto">
            <TabsTrigger value="content">{m.siteTabContent()}</TabsTrigger>
            <TabsTrigger value="layout">{m.siteTabLayout()}</TabsTrigger>
            <TabsTrigger value="style">{m.siteTabStyle()}</TabsTrigger>
          </TabsList>
          <TabsContent
            value="content"
            className="min-h-0 flex-1 overflow-y-auto"
          >
            {content}
          </TabsContent>
          <TabsContent
            value="layout"
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <PanelGroup title={m.siteLayout()}>
              <VariantPicker
                section={section}
                context={renderContext}
                onChange={(variant) =>
                  onChange({ ...section, variant } as PageSection)
                }
              />
            </PanelGroup>
            <PanelGroup title={m.siteSpacingAndWidth()}>
              <StudioField label={m.siteWidth()}>
                <Segmented
                  label={m.siteWidth()}
                  value={style.width}
                  options={(["contained", "wide", "full"] as const).map(
                    (value) => ({ value, label: WIDTH_LABEL[value]() }),
                  )}
                  onChange={(width) => setStyle("width", width)}
                />
              </StudioField>
              <StudioField label={m.siteSpacing()}>
                <Segmented
                  label={m.siteSpacing()}
                  value={style.spacing}
                  options={(["s", "m", "l"] as const).map((value) => ({
                    value,
                    label: SPACING_LABEL[value](),
                  }))}
                  onChange={(spacing) => setStyle("spacing", spacing)}
                />
              </StudioField>
              <StudioField label={m.siteAlignment()}>
                <Segmented
                  label={m.siteAlignment()}
                  value={style.align}
                  options={[
                    {
                      value: "start",
                      label: ALIGN_LABEL.start(),
                      icon: (
                        <AlignLeft
                          aria-hidden
                          className="size-4 rtl:-scale-x-100"
                        />
                      ),
                    },
                    {
                      value: "center",
                      label: ALIGN_LABEL.center(),
                      icon: <AlignCenter aria-hidden className="size-4" />,
                    },
                  ]}
                  onChange={(align) => setStyle("align", align)}
                />
              </StudioField>
            </PanelGroup>
            <PanelGroup title={m.siteVisibility()}>
              {otherLocale ? (
                <StudioField label={m.siteShownIn()}>
                  <Segmented
                    label={m.siteShownIn()}
                    value={style.hideIn[0] ?? "both"}
                    options={[
                      { value: "both", label: m.siteShownInBoth() },
                      {
                        value: otherLocale,
                        label: m.siteShownOnlyIn({
                          language: LOCALE_NAME[languages.primary](),
                        }),
                      },
                      {
                        value: languages.primary,
                        label: m.siteShownOnlyIn({
                          language: LOCALE_NAME[otherLocale](),
                        }),
                      },
                    ]}
                    onChange={(hidden) =>
                      setStyle("hideIn", hidden === "both" ? [] : [hidden])
                    }
                  />
                </StudioField>
              ) : null}
              <StudioField
                id={`${section.id}-anchor`}
                label={m.siteAnchor()}
                hint={m.siteAnchorHint()}
              >
                <Input
                  id={`${section.id}-anchor`}
                  dir="ltr"
                  value={style.anchor}
                  maxLength={41}
                  className="max-md:h-10"
                  onChange={(event) =>
                    setStyle(
                      "anchor",
                      event.target.value
                        .toLowerCase()
                        .replace(/[^a-z0-9-]/g, ""),
                    )
                  }
                />
              </StudioField>
            </PanelGroup>
          </TabsContent>
          <TabsContent value="style" className="min-h-0 flex-1 overflow-y-auto">
            <PanelGroup
              title={m.siteColourScheme()}
              hint={m.siteColourSchemeHint()}
            >
              <SchemePicker
                value={style.scheme}
                context={renderContext}
                onChange={(scheme) => setStyle("scheme", scheme)}
              />
            </PanelGroup>
            <PanelGroup title={m.siteBackground()}>
              <Segmented
                label={m.siteBackground()}
                value={background.kind}
                options={[
                  { value: "none", label: m.siteBackgroundNone() },
                  { value: "image", label: m.sitePicture() },
                  { value: "video", label: m.siteVideo() },
                ]}
                onChange={(kind) =>
                  setStyle("background", {
                    ...background,
                    kind,
                    fileId: kind === background.kind ? background.fileId : null,
                    posterFileId: null,
                    focus:
                      kind === background.kind ? background.focus : undefined,
                  })
                }
              />
              {background.kind === "none" ? null : (
                <div className="grid gap-3">
                  {background.fileId && background.kind === "image" ? (
                    <FocusPicker
                      src={`/files/${background.fileId}`}
                      value={background.focus}
                      onChange={(focus) =>
                        setStyle("background", { ...background, focus })
                      }
                    />
                  ) : null}
                  <div className="flex items-center gap-3">
                    {background.fileId && background.kind === "image" ? null : (
                      <div className="grid aspect-[16/10] w-28 place-items-center overflow-hidden rounded-md border bg-muted" />
                    )}
                    <FilePick
                      accept={
                        background.kind === "image"
                          ? fieldContext.media.accept.image
                          : ["video/mp4"]
                      }
                      label={
                        background.fileId ? m.siteReplace() : m.siteUpload()
                      }
                      busy={uploading.busy}
                      onFile={(file) =>
                        void uploading.upload(file, (fileId) =>
                          setStyle("background", {
                            ...background,
                            fileId,
                            focus: undefined,
                          }),
                        )
                      }
                    />
                  </div>
                  {background.kind === "video" ? (
                    <p className="text-[13px] leading-[18px] text-muted-foreground">
                      {m.siteBackgroundVideoHint()}
                    </p>
                  ) : null}
                  <StudioField
                    id={`${section.id}-overlay`}
                    label={m.siteOverlay({
                      amount: formatNumber(background.overlay),
                    })}
                    hint={m.siteOverlayHint()}
                  >
                    <input
                      id={`${section.id}-overlay`}
                      type="range"
                      min={0}
                      max={80}
                      step={5}
                      value={background.overlay}
                      onChange={(event) =>
                        setStyle("background", {
                          ...background,
                          overlay: Number(event.target.value),
                        })
                      }
                      className="w-full accent-primary"
                    />
                  </StudioField>
                </div>
              )}
            </PanelGroup>
            <PanelGroup title={m.siteTexture()} hint={m.siteTextureHint()}>
              <Segmented
                label={m.siteTexture()}
                value={style.pattern}
                options={PATTERNS.map((value) => ({
                  value,
                  label: PATTERN_LABEL[value](),
                }))}
                onChange={(pattern) => setStyle("pattern", pattern)}
              />
            </PanelGroup>
            <PanelGroup title={m.siteDividers()}>
              <StudioField label={m.siteDividerTop()}>
                <Segmented
                  label={m.siteDividerTop()}
                  value={style.dividerTop}
                  options={DIVIDERS.map((value) => ({
                    value,
                    label: DIVIDER_LABEL[value](),
                  }))}
                  onChange={(divider) => setStyle("dividerTop", divider)}
                />
              </StudioField>
              <StudioField label={m.siteDividerBottom()}>
                <Segmented
                  label={m.siteDividerBottom()}
                  value={style.dividerBottom}
                  options={DIVIDERS.map((value) => ({
                    value,
                    label: DIVIDER_LABEL[value](),
                  }))}
                  onChange={(divider) => setStyle("dividerBottom", divider)}
                />
              </StudioField>
            </PanelGroup>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
