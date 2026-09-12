import { CircleCheck, TriangleAlert } from "lucide-react";

import { SectionCard } from "~/components/app/primitives";
import * as m from "~/i18n/messages";

export interface AttentionItem {
  id: string;
  text: string;
}

/**
 * The strip that answers "is anything wrong today".
 *
 * An empty list is the good outcome, so it gets a positive statement rather
 * than the dashed empty box used where absent data is a gap.
 */
export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  return (
    <SectionCard title={m.overviewNeedsAttention()}>
      {items.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-[var(--success)]/30 bg-[var(--success)]/10 px-4 py-3">
          <CircleCheck
            className="mt-0.5 size-5 shrink-0 text-[var(--success)]"
            aria-hidden
          />
          <div className="min-w-0">
            <p className="text-sm font-medium">{m.overviewAllClear()}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {m.familyAllClearBody()}
            </p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-start gap-3 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm"
            >
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0 text-destructive"
                aria-hidden
              />
              <span className="min-w-0">{item.text}</span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
