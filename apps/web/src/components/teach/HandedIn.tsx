import { Progress, ProgressLabel } from "~/components/ui/progress";
import * as m from "~/i18n/messages";
import { cn } from "~/utils/cn";

import { percentOf } from "./format";

export function HandedIn({
  done,
  total,
  className,
}: {
  done: number;
  total: number;
  className?: string;
}) {
  return (
    <Progress
      value={percentOf(done, total)}
      className={cn("max-w-xs gap-1.5", className)}
    >
      <ProgressLabel className="text-xs font-normal text-muted-foreground">
        {m.teachHandedIn({ done, total })}
      </ProgressLabel>
    </Progress>
  );
}
