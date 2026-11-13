import type { QueryClient } from "@tanstack/react-query";
import type { ComponentType } from "react";

import { slot } from "~/utils/extension";

/** What a tab of the school's attendance is drawn with: the day it shows. */
export interface AttendanceTabProps {
  date: string;
  onDate: (date: string) => void;
}

/**
 * A tab a link of attendance adds to the school's attendance, for whoever
 * manages it, at its place among the page's own.
 */
export interface AttendanceTab {
  value: string;
  label: () => string;
  /** Where it sits among the tabs, low first. */
  place: number;
  /** What the tab reads on the day, loaded before it opens. */
  load(queryClient: QueryClient, date: string): Promise<unknown>;
  Tab: ComponentType<AttendanceTabProps>;
}

export const attendanceTabs = slot<AttendanceTab>("attendance tabs");
