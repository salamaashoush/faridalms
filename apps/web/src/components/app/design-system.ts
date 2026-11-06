import type { DesignSystemValue } from "@faridalms/ui/system/provider";

import { PAGE_SIZES } from "@faridalms/domain/paging";

import * as m from "~/i18n/messages";
import { getLocale, getTextDirection } from "~/i18n/runtime";
import { formatNumber } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";
import { validationMessage } from "~/utils/validation";

/** The design system in the reader's language, read afresh for each render. */
export function portalDesignSystem(): DesignSystemValue {
  return {
    direction: getTextDirection(getLocale()),
    formatNumber,
    errorMessage: getMessageFromError,
    issueMessage: validationMessage,
    pageSizes: PAGE_SIZES,
    strings: {
      actions: m.managementActions(),
      actionFailed: m.notificationErrorTitle(),
      ascending: m.indexAscending(),
      cancel: m.commonCancel(),
      changePhoto: m.photoChange(),
      choose: (label) => m.managementChoose({ label }),
      clear: m.commonClear(),
      clearFilter: m.indexClearFilter(),
      clearFilters: m.indexClearFilters(),
      close: m.commonClose(),
      columns: m.managementColumns(),
      countInTotal: (count) => m.indexCountLabel({ count }),
      dangerZone: m.formDangerZone(),
      descending: m.indexDescending(),
      discardChanges: m.editorDiscard(),
      done: m.indexDone(),
      edit: m.recordEdit(),
      emptyBody: m.commonEmptyBody(),
      emptyTitle: m.commonEmptyTitle(),
      errorDocumentTitle: (title) => m.formErrorDocumentTitle({ title }),
      errorSummaryItem: (label, message) =>
        m.formErrorSummaryItem({ label, message }),
      errorSummaryTitle: m.formErrorSummaryTitle(),
      filters: m.indexFilters(),
      filtersApplied: (count) => m.indexFiltersApplied({ count }),
      filtersHint: m.indexFiltersHint(),
      keepEditing: m.editorKeepEditing(),
      leaveHint: m.editorLeaveHint(),
      leaveTitle: m.editorLeaveTitle(),
      leaveWhileSavingHint: m.editorSavingHint(),
      more: m.shellMore(),
      moreActions: m.docMoreActions(),
      noMatches: m.managementNoMatches(),
      noResultsBody: m.indexNoResultsBody(),
      noResultsTitle: m.indexNoResultsTitle(),
      notApplicable: m.commonNotApplicable(),
      notRecorded: m.commonNotRecorded(),
      openMenu: m.navOpenMenu(),
      optional: m.formOptionalSuffix(),
      order: m.indexOrder(),
      pageNext: m.paginationNext(),
      pagePrevious: m.paginationPrevious(),
      pageStatus: (status) => m.paginationStatus(status),
      pagination: m.paginationLabel(),
      reset: m.indexReset(),
      rowActions: (name) => m.indexRowActions({ name }),
      rowsPerPage: m.indexRowsPerPage(),
      save: m.commonSave(),
      saved: m.docSaved(),
      searchAndFilter: m.indexToolbar(),
      searchFor: (label) => m.managementSearchFor({ label }),
      selectAll: m.indexSelectAll(),
      selectRow: (name) => m.indexSelectRow({ name }),
      selectedCount: (count) => m.indexSelectedCount({ count }),
      skipToContent: m.navSkipToContent(),
      sortBy: m.indexSortBy(),
      theme: m.shellTheme(),
      themeDark: m.shellThemeDark(),
      themeLight: m.shellThemeLight(),
      themeSystem: m.shellThemeSystem(),
      view: m.indexView(),
    },
  };
}
