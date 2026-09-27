import type { SiteLocale } from "@faridalms/domain/site-sections";
import type { Theme } from "@faridalms/domain/site-theme";
import type { CSSProperties, ReactNode } from "react";

import { ArrowDown, ArrowUp, Copy, EyeOff, Plus, Trash2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";
import { formatNumber } from "~/utils/datetime";

import type { SiteFrameModel } from "../render/frame";
import type { RenderContext } from "../render/parts";
import type { CanvasSection } from "./draft";

import { SiteFrame } from "../render/frame";
import { opensOnPicture, PageSections } from "../render/page";
import { TextEditContext } from "../render/parts";
import { schemeStyle, themeAttributes, themeStyle } from "../render/theme";
import { SECTION_LABEL } from "./labels";

/** Builder controls inside the zoomed canvas keep their true size. */
const UNZOOM = { zoom: "calc(1 / var(--canvas-zoom, 1))" } as CSSProperties;

export const DEVICES = { desktop: 1440, tablet: 820, phone: 390 } as const;
export type Device = keyof typeof DEVICES;

/**
 * A site drawn at a fixed width and zoomed to fit, so its container queries
 * see the device's width and not the space the studio has.
 */
export function Viewport({
  width,
  theme,
  locale,
  fit = true,
  scale: fixedScale,
  className,
  children,
}: {
  width: number;
  theme: Theme;
  locale: SiteLocale;
  fit?: boolean;
  scale?: number;
  className?: string;
  children: ReactNode;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(fixedScale ?? 1);
  useLayoutEffect(() => {
    const element = outer.current;
    if (fixedScale !== undefined || !fit || !element) return undefined;
    const measure = () => setScale(Math.min(1, element.clientWidth / width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [width, fit, fixedScale]);
  return (
    <div ref={outer} className={cn("min-w-0", className)}>
      <div
        className="site-root mx-auto"
        lang={locale}
        dir={locale === "ar" ? "rtl" : "ltr"}
        {...themeAttributes(theme, true)}
        style={
          {
            width,
            zoom: scale,
            "--canvas-zoom": scale,
            ...themeStyle(theme, locale),
            ...schemeStyle(theme, "canvas"),
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}

function SectionChrome({
  item,
  index,
  count,
  selected,
  locale,
  onSelect,
  onMove,
  onDuplicate,
  onRemove,
  onInsert,
  onText,
  children,
}: {
  item: CanvasSection;
  index: number;
  count: number;
  selected: boolean;
  locale: SiteLocale;
  onSelect: () => void;
  onMove: (by: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onInsert: (at: number) => void;
  onText: (field: string, value: string) => void;
  children: ReactNode;
}) {
  const label = SECTION_LABEL[item.section.type]();
  const t = { locale };
  return (
    <div
      data-section={item.section.id}
      className={cn(
        "group/section relative scroll-mt-20",
        item.hidden && "opacity-40",
      )}
    >
      {/* Once selected, a section's words take typing and its overlay
          lets clicks through to them. */}
      <TextEditContext.Provider value={selected ? onText : null}>
        {children}
      </TextEditContext.Provider>
      <button
        type="button"
        aria-label={m.siteSelectSection({
          section: label,
          number: formatNumber(index + 1),
        })}
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(
          "absolute inset-0 z-10 cursor-pointer outline-offset-[-3px] hover:outline-2 hover:outline-[#2563eb]/60 hover:outline-dashed focus-visible:outline-3 focus-visible:outline-[#2563eb]",
          selected &&
            "pointer-events-none outline-3 outline-[#2563eb] outline-solid hover:outline-solid",
        )}
      />
      <span
        aria-hidden
        style={UNZOOM}
        className={cn(
          "pointer-events-none absolute start-3 top-3 z-20 rounded bg-[#2563eb] px-2 py-1 font-sans text-xs font-semibold text-white opacity-0 group-hover/section:opacity-100",
          selected && "opacity-100",
        )}
      >
        {label}
        {item.hidden
          ? ` · ${m.siteHiddenHere({}, t)}`
          : item.untranslated
            ? ` · ${m.siteShownInOriginal({}, t)}`
            : ""}
      </span>
      {selected ? (
        <div
          role="toolbar"
          aria-label={label}
          style={UNZOOM}
          className="absolute end-3 top-3 z-20 flex gap-0.5 rounded-lg bg-[#111827] p-1 font-sans text-white shadow-lg"
        >
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-white hover:bg-white/15 hover:text-white"
            aria-label={m.siteMoveSectionUp()}
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-white hover:bg-white/15 hover:text-white"
            aria-label={m.siteMoveSectionDown()}
            disabled={index === count - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-white hover:bg-white/15 hover:text-white"
            aria-label={m.siteDuplicateSection()}
            onClick={onDuplicate}
          >
            <Copy aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            className="text-white hover:bg-white/15 hover:text-white"
            aria-label={m.siteRemoveSection()}
            onClick={onRemove}
          >
            <Trash2 aria-hidden />
          </Button>
        </div>
      ) : null}
      {item.hidden ? (
        <EyeOff
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 m-auto size-10 text-[#111827]"
        />
      ) : null}
      <button
        type="button"
        onClick={() => onInsert(index + 1)}
        aria-label={m.siteInsertSectionAfter({ section: label })}
        style={UNZOOM}
        className="absolute start-1/2 bottom-0 z-20 grid size-9 -translate-x-1/2 translate-y-1/2 place-items-center rounded-full bg-[#2563eb] text-white opacity-0 shadow-lg transition-opacity group-hover/section:opacity-100 focus-visible:opacity-100 rtl:translate-x-1/2"
      >
        <Plus aria-hidden className="size-5" />
      </button>
    </div>
  );
}

/**
 * The page being built, drawn by the same components visitors see, with the
 * site's frame around it, at the chosen device width and language.
 */
export function Canvas({
  device,
  locale,
  frame,
  context,
  sections,
  title,
  selected,
  onSelect,
  onMove,
  onDuplicate,
  onRemove,
  onInsert,
  onText,
}: {
  device: Device;
  locale: SiteLocale;
  frame: SiteFrameModel;
  context: RenderContext;
  sections: CanvasSection[];
  title: string;
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, by: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onInsert: (at: number) => void;
  onText: (id: string, field: string, value: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selected) return;
    const element = scroller.current?.querySelector(
      `[data-section="${selected}"]`,
    );
    element?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);
  const visible = sections.filter((item) => !item.hidden);
  const byId = new Map(sections.map((item) => [item.section.id, item]));
  return (
    <div
      ref={scroller}
      className="@container h-full overflow-auto bg-[#e9ebef] p-4 max-lg:p-0 dark:bg-[#1b1d22]"
    >
      <Viewport
        width={DEVICES[device]}
        theme={context.theme}
        locale={locale}
        className={cn("mx-auto", device !== "desktop" && "max-w-full")}
      >
        <div className="overflow-hidden rounded-[10px] shadow-[0_8px_40px_rgba(15,23,42,.18)] max-lg:rounded-none max-lg:shadow-none">
          <SiteFrame
            frame={frame}
            context={context}
            overlay={opensOnPicture(visible)}
          >
            {sections.length === 0 ? (
              <div className="grid min-h-[60vh] place-items-center p-10 font-sans">
                <Button type="button" size="lg" onClick={() => onInsert(0)}>
                  <Plus aria-hidden />
                  {m.siteAddFirstSection()}
                </Button>
              </div>
            ) : (
              <PageSections
                sections={sections}
                title={title}
                context={context}
                renderSection={(shown, index, rendered) => {
                  const item = byId.get(shown.section.id) ?? {
                    ...shown,
                    hidden: false,
                    untranslated: false,
                  };
                  return (
                    <SectionChrome
                      item={item}
                      index={index}
                      count={sections.length}
                      selected={selected === shown.section.id}
                      locale={locale}
                      onSelect={() => onSelect(shown.section.id)}
                      onMove={(by) => onMove(shown.section.id, by)}
                      onDuplicate={() => onDuplicate(shown.section.id)}
                      onRemove={() => onRemove(shown.section.id)}
                      onInsert={onInsert}
                      onText={(field, value) =>
                        onText(shown.section.id, field, value)
                      }
                    >
                      {rendered}
                    </SectionChrome>
                  );
                }}
              />
            )}
          </SiteFrame>
        </div>
      </Viewport>
    </div>
  );
}
