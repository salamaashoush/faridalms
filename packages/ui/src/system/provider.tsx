import type { ReactNode } from "react";

import { DirectionProvider } from "@base-ui/react/direction-provider";
import { createContext, useContext } from "react";

/** The counts a pagination footer reads out. */
export interface PageStatus {
  page: string;
  pages: string;
  total: string;
  /** The raw total, for languages whose wording changes with the number. */
  count: number;
}

/**
 * Every word the design system's components say themselves. An app supplies
 * them in its reader's language; the components never hold their own copy.
 */
export interface SystemStrings {
  actions: string;
  actionFailed: string;
  ascending: string;
  cancel: string;
  changePhoto: string;
  /** Said before a field's earlier value in a change log, for a screen reader. */
  changedWas: string;
  /** Said before a field's new value in a change log, for a screen reader. */
  changedNow: string;
  choose: (label: string) => string;
  clear: string;
  clearFilter: string;
  clearFilters: string;
  close: string;
  columns: string;
  compareBody: string;
  compareKeepMine: string;
  compareKeepSaved: string;
  compareMine: string;
  compareSaved: string;
  compareTakeAndKeepMine: string;
  compareTakenBody: (name: string) => string;
  compareTitle: string;
  compareVersions: string;
  copied: string;
  countInTotal: (count: string) => string;
  dangerZone: string;
  descending: string;
  discardChanges: string;
  done: string;
  dropFiles: string;
  edit: string;
  emptyBody: string;
  emptyTitle: string;
  errorBody: string;
  errorDetails: string;
  errorDocumentTitle: (title: string) => string;
  errorRetry: string;
  errorSummaryItem: (label: string, message: string) => string;
  errorSummaryTitle: string;
  errorTitle: string;
  filters: string;
  filtersApplied: (count: string) => string;
  filtersHint: string;
  goBack: string;
  goHome: string;
  gridBaseline: (source: string, value: string) => string;
  gridChanged: (source: string, count: string) => string;
  gridKeys: string;
  gridNoFigure: string;
  gridReset: string;
  holdCompare: string;
  holdCopy: string;
  holdHeld: (name: string, since: string) => string;
  holdTakeOver: string;
  holdTakeOverBody: (name: string) => string;
  holdTakeOverTitle: (name: string) => string;
  holdTaken: (name: string, since: string) => string;
  holdUnsaved: string;
  keepEditing: string;
  leaveHint: string;
  leaveTitle: string;
  leaveWhileSavingHint: string;
  more: string;
  moreActions: string;
  /** Names a section's More, so two sections' never share a name. */
  moreIn: (section: string) => string;
  noMatches: string;
  noResultsBody: string;
  noResultsTitle: string;
  notApplicable: string;
  notFoundBody: string;
  notFoundTitle: string;
  notRecorded: string;
  openMenu: string;
  optional: string;
  order: string;
  pageNext: string;
  pagePrevious: string;
  pageStatus: (status: PageStatus) => string;
  pagination: string;
  reset: string;
  rowActions: (name: string) => string;
  rowsPerPage: string;
  /** Points a level is worth, worded for the number. */
  rubricPoints: (count: number) => string;
  /** The most a criterion earns, given its points already worded. */
  rubricBest: (points: string) => string;
  rubricScored: (score: string, best: string) => string;
  rubricAwarded: string;
  rubricNotMarked: string;
  rubricTotal: string;
  rubricCancelEdit: (criterion: string) => string;
  rubricLevelsOf: (criterion: string) => string;
  rubricClear: (criterion: string) => string;
  rubricLevelMoved: (level: string, position: string) => string;
  rubricMoveUp: string;
  rubricMoveDown: string;
  rubricRemoveLevel: string;
  rubricAddLevel: string;
  rubricLevelName: string;
  rubricLevelPoints: string;
  rubricLevelDescription: string;
  rubricLevelNameOf: (number: string) => string;
  rubricLevelPointsOf: (level: string) => string;
  rubricLevelDescriptionOf: (level: string) => string;
  save: string;
  saved: string;
  searchAndFilter: string;
  searchFor: (label: string) => string;
  selectAll: string;
  selectRow: (name: string) => string;
  selectedCount: (count: string) => string;
  selectionActions: string;
  setupDone: string;
  setupHide: string;
  setupOpen: string;
  setupOptional: string;
  setupProgress: (done: string, total: string) => string;
  setupReview: string;
  setupStart: string;
  setupToDo: string;
  clearSelection: string;
  skipToContent: string;
  sortBy: string;
  theme: string;
  themeDark: string;
  themeLight: string;
  themeSystem: string;
  uploadCancel: (name: string) => string;
  uploadDismiss: (name: string) => string;
  uploadProgress: (name: string, percent: string) => string;
  uploadRetry: string;
  uploadWaiting: string;
  view: string;
}

/** A form issue as validators report it: a message, which may be a key. */
export interface Issue {
  message?: string;
}

/** How the reader's language writes and what it calls things. */
export interface DesignSystemValue {
  strings: SystemStrings;
  direction: "ltr" | "rtl";
  formatNumber: (value: number) => string;
  /** What to tell the reader about a failure, in their language. */
  errorMessage: (error: unknown) => string;
  /** A validator's issue as the reader should read it. */
  issueMessage: (issue: Issue) => string;
  /** The page sizes a list offers, which the app's server accepts. */
  pageSizes: readonly number[];
}

const DesignSystemContext = createContext<DesignSystemValue | null>(null);

export interface DesignSystemProviderProps {
  value: DesignSystemValue;
  children: ReactNode;
}

/**
 * Gives the design system its language. Every app wraps its pages in one,
 * so a component never falls back to words the reader did not choose.
 * Base UI reads direction from its own context rather than from the page,
 * for arrow keys in tabs, menus and radios and for popup alignment, so the
 * provider passes it on.
 */
export function DesignSystemProvider({
  value,
  children,
}: DesignSystemProviderProps) {
  return (
    <DesignSystemContext.Provider value={value}>
      <DirectionProvider direction={value.direction}>
        {children}
      </DirectionProvider>
    </DesignSystemContext.Provider>
  );
}

export function useDesignSystem(): DesignSystemValue {
  const value = useContext(DesignSystemContext);
  if (!value)
    throw new Error("A design-system component needs a DesignSystemProvider");
  return value;
}

export function useSystemStrings(): SystemStrings {
  return useDesignSystem().strings;
}

/** The side a panel opens from: the end of the line in the reader's direction. */
export function useEndSide(): "left" | "right" {
  return useDesignSystem().direction === "rtl" ? "left" : "right";
}
