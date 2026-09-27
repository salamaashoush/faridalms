import type { ImageSize } from "@faridalms/domain/content";
import type { ElementFormatType } from "lexical";

import { imageSizes } from "@faridalms/domain/content";
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";

import { useEditorEnvironment } from "../context";
import { cx } from "../ui";

const ALIGNMENTS = [
  { value: "start", icon: AlignLeft },
  { value: "center", icon: AlignCenter },
  { value: "end", icon: AlignRight },
] as const;

const buttonClass =
  "inline-flex h-7 items-center justify-center rounded-md px-2 text-xs font-medium hover:bg-accent aria-pressed:bg-accent disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5";

/**
 * The width and alignment of a picture, drawing, video or embed, the same bar
 * on each, shown over the block (a `group/media` box) while it is selected or
 * hovered.
 */
export function LayoutBar({
  size,
  format,
  onSize,
  onAlign,
  visible,
}: {
  size: ImageSize;
  format: ElementFormatType;
  onSize: (size: ImageSize) => void;
  onAlign: (format: ElementFormatType) => void;
  visible: boolean;
}) {
  const { strings } = useEditorEnvironment();
  const labels: Record<ImageSize, string> = {
    small: strings.sizeSmall,
    medium: strings.sizeMedium,
    large: strings.sizeLarge,
    full: strings.sizeFull,
  };
  const alignLabels = {
    start: strings.alignStart,
    center: strings.alignCenter,
    end: strings.alignEnd,
  };
  const current = format === "start" || format === "end" ? format : "center";
  return (
    <div
      role="toolbar"
      aria-label={strings.imageSize}
      className={cx(
        "absolute end-2 top-2 z-10 flex items-center gap-0.5 rounded-lg border bg-popover p-0.5 text-popover-foreground shadow-md transition-opacity focus-within:opacity-100",
        visible
          ? "opacity-100"
          : "pointer-events-none opacity-0 group-hover/media:pointer-events-auto group-hover/media:opacity-100",
      )}
    >
      {ALIGNMENTS.map((alignment) => (
        <button
          key={alignment.value}
          type="button"
          aria-label={alignLabels[alignment.value]}
          title={alignLabels[alignment.value]}
          aria-pressed={size !== "full" && current === alignment.value}
          disabled={size === "full"}
          className={buttonClass}
          onClick={() => onAlign(alignment.value)}
        >
          <alignment.icon className="rtl:-scale-x-100" aria-hidden />
        </button>
      ))}
      <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
      {imageSizes.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={size === value}
          className={buttonClass}
          onClick={() => onSize(value)}
        >
          {labels[value]}
        </button>
      ))}
    </div>
  );
}
