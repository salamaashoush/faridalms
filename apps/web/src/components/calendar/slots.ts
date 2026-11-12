import type { LinkProps } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";

import { slot } from "~/utils/extension";

/**
 * Things a module keeps in the calendar under a category of its own: how
 * the category is named and marked, how one is titled, and where it opens.
 */
export interface CalendarOrigin {
  /** The key its entries carry as their origin. */
  key: string;
  category: string;
  label: () => string;
  mark: { icon: LucideIcon; colour: string };
  title(kind: string, name: string): string;
  linkOf(origin: { id: string; kind: string }): LinkProps;
}

export const calendarOrigins = slot<CalendarOrigin>("calendar origins");
