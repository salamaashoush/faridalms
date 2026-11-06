import { WARN_SHARE } from "@faridalms/domain/plans";
import { cn } from "@faridalms/ui/cn";

import { formatBytes } from "../format";

/** A school's storage against its pool; the bar only draws the line beside it. */
export interface UsageProps {
  /** What the school's cell last reported, or null before it has. */
  usedBytes: number | null;
  limitBytes: number;
}

export function Usage({ usedBytes, limitBytes }: UsageProps) {
  if (usedBytes === null)
    return <span className="text-muted-foreground">Not measured yet</span>;
  const share = usedBytes / limitBytes;
  const nearly = share >= WARN_SHARE;
  return (
    <span className="grid min-w-40 gap-1">
      <span
        className={cn(
          "tabular-nums",
          nearly && "text-warning-foreground dark:text-warning",
        )}
      >
        {formatBytes(usedBytes)} of {formatBytes(limitBytes)}
      </span>
      <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
        <span
          className={cn(
            "block h-full rounded-full",
            nearly ? "bg-warning" : "bg-primary",
          )}
          style={{ width: `${Math.min(100, share * 100)}%` }}
        />
      </span>
    </span>
  );
}
