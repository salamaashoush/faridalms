import type { CalendarCategory } from "@faridalms/domain/calendar";

import { CALENDAR_CATEGORIES } from "@faridalms/domain/calendar";
import { ListFilter } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import { CATEGORY_LABEL } from "./format";
import { CategoryIcon } from "./views";

/**
 * The kinds of event to show, as one button on a phone where the legend's
 * chips would not fit on a line.
 */
export function KindFilter({
  hidden,
  onToggle,
  onShowAll,
}: {
  hidden: ReadonlySet<CalendarCategory>;
  onToggle: (category: CalendarCategory) => void;
  onShowAll: () => void;
}) {
  const total = CALENDAR_CATEGORIES.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="outline" className="h-10" />}
      >
        <ListFilter aria-hidden />
        {hidden.size
          ? m.calKindsShown({
              shown: formatNumber(total - hidden.size),
              total: formatNumber(total),
            })
          : m.calKinds()}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {CALENDAR_CATEGORIES.map((category) => (
          <DropdownMenuCheckboxItem
            key={category}
            checked={!hidden.has(category)}
            onCheckedChange={() => onToggle(category)}
            className="min-h-10"
          >
            <CategoryIcon category={category} className="size-4" />
            {CATEGORY_LABEL[category]()}
          </DropdownMenuCheckboxItem>
        ))}
        {hidden.size ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-10" onClick={onShowAll}>
              {m.calShowAll()}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
