import type { DesignSystemValue, SystemStrings } from "./provider";

/** The design system's own words in English, for an app with no catalogue. */
export const ENGLISH_STRINGS: SystemStrings = {
  actions: "Actions",
  actionFailed: "Error",
  ascending: "Ascending",
  cancel: "Cancel",
  changePhoto: "Change photo",
  choose: (label) => `Choose ${label}…`,
  clear: "Clear",
  clearFilter: "Clear filter",
  clearFilters: "Clear filters",
  close: "Close",
  columns: "Columns",
  countInTotal: (count) => `${count} in total`,
  dangerZone: "Danger zone",
  descending: "Descending",
  discardChanges: "Discard changes",
  done: "Done",
  edit: "Edit",
  emptyBody: "When there is something to show, it will appear here.",
  emptyTitle: "Nothing here yet",
  errorDocumentTitle: (title) => `Error: ${title}`,
  errorSummaryItem: (label, message) => `${label}: ${message}`,
  errorSummaryTitle: "There is a problem",
  filters: "Filters",
  filtersApplied: (count) => `${count} applied`,
  filtersHint: "Changes apply straight away.",
  keepEditing: "Keep editing",
  leaveHint:
    "Your changes have not been saved. Stay here to finish editing or discard these changes.",
  leaveTitle: "Leave without saving?",
  leaveWhileSavingHint:
    "Your changes are being saved. Please wait for the result before leaving.",
  more: "More",
  moreActions: "More actions",
  noMatches: "No matching records",
  noResultsBody:
    "Try a different search, or clear the filters to see everything.",
  noResultsTitle: "Nothing matches your search or filters",
  notApplicable: "Not applicable",
  notRecorded: "Not recorded",
  openMenu: "Open menu",
  optional: "(optional)",
  order: "Order",
  pageNext: "Next page",
  pagePrevious: "Previous page",
  pageStatus: ({ page, pages, total, count }) =>
    `Page ${page} of ${pages} · ${total} ${count === 1 ? "result" : "results"}`,
  pagination: "Table pages",
  reset: "Reset",
  rowActions: (name) => `Actions for ${name}`,
  rowsPerPage: "Rows per page",
  save: "Save",
  saved: "Saved",
  searchAndFilter: "Search and filter",
  searchFor: (label) => `Search ${label}…`,
  selectAll: "Select all rows on this page",
  selectRow: (name) => `Select ${name}`,
  selectedCount: (count) => `${count} selected`,
  skipToContent: "Skip to content",
  sortBy: "Sort by",
  theme: "Appearance",
  themeDark: "Dark",
  themeLight: "Light",
  themeSystem: "Match device",
  view: "View",
};

const numbers = new Intl.NumberFormat("en");

/** English, left to right, with an error's own message as what to say. */
export const ENGLISH: DesignSystemValue = {
  strings: ENGLISH_STRINGS,
  direction: "ltr",
  formatNumber: (value) => numbers.format(value),
  errorMessage: (error) =>
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Something went wrong.",
  issueMessage: (issue) => issue.message ?? "Check this field.",
};
