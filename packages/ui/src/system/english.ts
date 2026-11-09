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
  compareBody:
    "Someone saved this while you were changing it, so your change was not saved. Choose which version to keep.",
  compareKeepMine: "Keep mine",
  compareKeepSaved: "Keep the saved one",
  compareMine: "Yours, not saved",
  compareSaved: "Saved",
  compareTakeAndKeepMine: "Take over and keep mine",
  compareTakenBody: (name) =>
    `${name} took this over before your change was saved. Choose which version to keep.`,
  compareTitle: "Compare versions",
  compareVersions: "Versions",
  copied: "Copied",
  countInTotal: (count) => `${count} in total`,
  dangerZone: "Danger zone",
  descending: "Descending",
  discardChanges: "Discard changes",
  done: "Done",
  dropFiles: "Drop to upload",
  edit: "Edit",
  emptyBody: "When there is something to show, it will appear here.",
  emptyTitle: "Nothing here yet",
  errorBody:
    "An unexpected error occurred. You can retry, or go back and try again.",
  errorDetails: "Technical details",
  errorDocumentTitle: (title) => `Error: ${title}`,
  errorRetry: "Try again",
  errorSummaryItem: (label, message) => `${label}: ${message}`,
  errorSummaryTitle: "There is a problem",
  errorTitle: "Something went wrong",
  filters: "Filters",
  filtersApplied: (count) => `${count} applied`,
  filtersHint: "Changes apply straight away.",
  goBack: "Go back",
  goHome: "Go home",
  holdCompare: "Compare versions",
  holdCopy: "Copy my change",
  holdHeld: (name, since) =>
    `${name} has been editing this since ${since}. You can read it while they do.`,
  holdTakeOver: "Take over",
  holdTakeOverBody: (name) =>
    `${name} can no longer change it. Anything they have not saved stays on their screen to copy or compare.`,
  holdTakeOverTitle: (name) => `Take over from ${name}?`,
  holdTaken: (name, since) =>
    `${name} took this over at ${since}. You can read it but no longer change it.`,
  holdUnsaved: "Your last change was not saved.",
  keepEditing: "Keep editing",
  leaveHint:
    "Your changes have not been saved. Stay here to finish editing or discard these changes.",
  leaveTitle: "Leave without saving?",
  leaveWhileSavingHint:
    "Your changes are being saved. Please wait for the result before leaving.",
  more: "More",
  moreActions: "More actions",
  moreIn: (section) => `More in ${section}`,
  noMatches: "No matching records",
  noResultsBody:
    "Try a different search, or clear the filters to see everything.",
  noResultsTitle: "Nothing matches your search or filters",
  notApplicable: "Not applicable",
  notFoundBody:
    "The page you are looking for does not exist or may have moved.",
  notFoundTitle: "Page not found",
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
  selectionActions: "Actions for the selected rows",
  clearSelection: "Clear selection",
  skipToContent: "Skip to content",
  sortBy: "Sort by",
  theme: "Appearance",
  themeDark: "Dark",
  themeLight: "Light",
  themeSystem: "Match device",
  uploadCancel: (name) => `Stop uploading ${name}`,
  uploadDismiss: (name) => `Remove ${name} from the list`,
  uploadProgress: (name, percent) => `Uploading ${name}, ${percent}`,
  uploadRetry: "Try again",
  uploadWaiting: "Waiting",
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
  pageSizes: [25, 50],
};
