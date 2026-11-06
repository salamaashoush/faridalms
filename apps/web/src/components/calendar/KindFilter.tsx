import type { ShownCategory } from "@faridalms/domain/calendar";

import { Button } from "@faridalms/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@faridalms/ui/dropdown-menu";
import { ListFilter } from "lucide-react";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import { CATEGORY_LABEL } from "./format";
import { CategoryIcon } from "./views";

export interface KindFilterProps {
  categories: readonly ShownCategory[];
  hidden: ReadonlySet<ShownCategory>;
  onToggle: (category: ShownCategory) => void;
  onShowAll: () => void;
}

/**
 * The kinds of event to show, as one button on a phone where the legend's
 * chips would not fit on a line.
 */
export function KindFilter({
  categories,
  hidden,
  onToggle,
  onShowAll,
}: KindFilterProps) {
  const total = categories.length;
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
        {categories.map((category) => (
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
