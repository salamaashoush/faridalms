import { WARN_SHARE } from "@faridalms/domain/plans";
import { cn } from "@faridalms/ui/cn";
import { TriangleAlert } from "lucide-react";

import { fileSizeLabel } from "~/components/system/FileList";
import * as m from "~/i18n/messages";

/**
 * How full a storage limit is, warning once it passes the warning share. The
 * bar only draws what the line above it says.
 */
export function UsageBar({
  usedBytes,
  limitBytes,
  className,
}: {
  usedBytes: number;
  limitBytes: number;
  className?: string;
}) {
  const share = limitBytes > 0 ? usedBytes / limitBytes : 1;
  const nearly = share >= WARN_SHARE;
  const label = m.filesUsage({
    used: fileSizeLabel(usedBytes),
    limit: fileSizeLabel(limitBytes),
  });
  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3 text-[13px] leading-[18px]">
        <span className="text-muted-foreground">{m.filesUsageLabel()}</span>
        <span
          className={cn(
            "tabular-nums",
            nearly && "text-warning-foreground dark:text-warning",
          )}
        >
          {label}
        </span>
      </div>
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            nearly ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${Math.min(100, share * 100)}%` }}
        />
      </div>
      {nearly ? (
        <p className="flex items-start gap-1.5 text-[13px] leading-[18px] text-warning-foreground dark:text-warning [&_svg]:mt-0.5 [&_svg]:size-3.5 [&_svg]:shrink-0">
          <TriangleAlert aria-hidden />
          {m.filesUsageNearlyFull()}
        </p>
      ) : null}
    </div>
  );
}
