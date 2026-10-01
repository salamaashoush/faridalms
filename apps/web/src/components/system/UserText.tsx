import { textDirection } from "@faridalms/domain/content";
import { cn } from "@faridalms/ui/cn";

import { getLocale } from "~/i18n/runtime";

/**
 * Text someone wrote, cut to one line or two. It takes its own direction so
 * the cut falls at its end in either script, and aligns to the page's start
 * so it lines up with the labels around it.
 */
export function UserText({
  text,
  lines = 1,
  className,
}: {
  text: string;
  lines?: 1 | 2;
  className?: string;
}) {
  const own = textDirection(text);
  const page = getLocale() === "ar" ? "rtl" : "ltr";
  return (
    <span
      dir={own ?? undefined}
      className={cn(
        "block",
        lines === 1 ? "truncate" : "line-clamp-2",
        own && own !== page && "text-end",
        className,
      )}
    >
      {text}
    </span>
  );
}
