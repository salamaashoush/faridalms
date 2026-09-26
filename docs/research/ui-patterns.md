# UI patterns research

Primary sources read on 2026-09-26: Shopify Polaris (from its repository, since
its site now redirects to shopify.dev), GitHub Primer, Atlassian Design System,
IBM Carbon, GOV.UK Design System, Microsoft Fluent 2, Apple HIG, Nielsen Norman
Group, Notion and Linear help centres, and shadcn/ui blocks and examples. The
rules distilled from this live in [../design-system.md](../design-system.md).

"P:" below means `https://github.com/Shopify/polaris/blob/main/polaris.shopify.com/content/`.

## 1. Editor pages for rich content

**Pattern:** a document-style top bar: status beside the title, Publish as the
only primary button, Delete in the overflow menu, drafts that save themselves.

- Polaris: a single primary activity is a primary button in the page header,
  other actions are secondary actions there; a status badge follows the title
  (`titleMetadata`). With unsaved changes a save bar replaces the top bar:
  "Unsaved changes", Save and Discard. Unique actions go at the top of the
  actions menu, routine ones at the bottom. "Auto-save for forms is
  incongruous with the standard Shopify admin save UX." (P:components/layout-and-structure/page.mdx,
  P:components/deprecated/contextual-save-bar.mdx,
  P:patterns/resource-details-layout/variants/default.mdx,
  https://shopify.dev/docs/apps/design/user-experience/forms,
  https://shopify.dev/docs/api/app-bridge-library/apis/save-bar)
- Notion and Linear: no save button. "Notion saves automatically"; Linear
  shows who last edited and when. Share and Publish at the top end; history,
  full width and delete in `•••`.
  (https://www.notion.com/help/writing-and-editing-basics,
  https://www.notion.com/help/public-pages-and-web-publishing,
  https://linear.app/docs/documents)
- Primer: start with explicit saving, never mix save patterns in one form,
  submit bottom-start with Cancel after it, never disable Save, warn on
  `beforeunload`; if every field saves itself, show no save button.
  (https://primer.style/product/ui-patterns/saving/)
- Carbon disagrees on placement: do not top-align or pin form buttons at the
  top of a dedicated form page. (https://carbondesignsystem.com/patterns/forms-pattern/)
- NN/g: most people assume nothing changed until Save; autosave and Save can
  coexist; show "Saved". Label close actions Close or Cancel explicitly.
  (https://www.nngroup.com/articles/efficiency-vs-expectations/,
  https://www.nngroup.com/articles/cancel-vs-close/)
- GOV.UK: the red warning button only on the final confirmation of a serious
  destructive action. (https://design-system.service.gov.uk/components/button/)

**Reading:** Carbon, Primer and GOV.UK treat this as a form (actions at the
bottom). Polaris, Notion, Linear and shadcn treat it as a document (actions at
the top). Announcements and coursework are long documents whose publishing
changes state, so the top bar fits; record forms keep bottom actions.

## 2. Record and settings forms

- Polaris settings: two columns, "glanceable labels and descriptions" at the
  start and grouped fields in cards at the end; description only when it helps
  (P:patterns/app-settings-layout/variants/default.mdx). Detail pages: primary
  column two thirds, secondary for status, metadata and summaries; default
  width, not full. Measured in its source: primary 662px, secondary 240–320px,
  page about 998px, padding 24px.
- One column of fields: Atlassian ("Use one form column"), NN/g ("multiple
  columns interrupt the vertical momentum"), Carbon and Primer. Carbon allows
  two or three closely related inputs on one line.
  (https://atlassian.design/components/form/usage,
  https://www.nngroup.com/articles/web-form-design/)
- Submit at the bottom, start side, for page forms; end side only in dialogs
  (Primer, Atlassian, Carbon, GOV.UK). (https://atlassian.design/components/button/usage)
- Carbon spacing: 32px between fields on a page (16–24 inside containers),
  32–40px between sections, 48px before buttons, 40px inputs.
- Never disable Save (Primer, Atlassian); everyone disables it during submit.
- Destructive: danger button with confirmation, or Delete in the header
  overflow (Polaris).

## 3. Field conventions

- Labels above fields; 1–3 words, sentence case, no colon (Carbon, NN/g,
  GOV.UK, Primer).
- Required versus optional disagrees:
  GOV.UK marks "(optional)" and never uses asterisks
  (https://design-system.service.gov.uk/patterns/question-pages/);
  Carbon marks the minority; NN/g asks for asterisks on required fields and
  notes marking optional ones lightens load
  (https://www.nngroup.com/articles/required-fields/); Atlassian uses
  asterisks and "avoid optional fields"; Primer uses asterisks.
  We follow GOV.UK: our users are the general public, most fields are
  required, and "(optional)" needs no legend.
- Hint between label and input (GOV.UK); must not repeat the label or error
  and hides when an error shows (Primer). Placeholders never replace labels.
- Validation: GOV.UK on submit; Carbon on blur; Primer on submit then live on
  invalid fields. Error summary at the top, linked to fields, focused, and the
  page title prefixed "Error:" (GOV.UK, https://design-system.service.gov.uk/components/error-summary/).
- Widths match the expected answer: GOV.UK fixed character widths
  (2–30 chars) and fractions (https://design-system.service.gov.uk/components/text-input/);
  NN/g and Primer agree.
- Carbon inputs default to 40px everywhere; table toolbars follow row size.

## 4. Status indicators

- Polaris: one past-tense word, two for complex states; don't invent new
  badges; hidden text for screen readers (P:components/feedback-indicators/badge.mdx).
- Atlassian lozenge: neutral, success, warning, danger, information,
  discovery; subtle and bold; sentence case (https://atlassian.design/components/lozenge/usage).
- Primer: StateLabel for lifecycle (filled, icon) versus Label for metadata;
  "convey meaning with more than colour" (https://primer.style/product/components/state-label/).
- Carbon: red error, orange serious, yellow warning, green success, blue
  in progress, grey drafts; use three of symbol, shape, colour and text; more
  than 5–6 indicators overwhelms (https://carbondesignsystem.com/patterns/status-indicator-pattern/).
- Linear: icon plus text, not pills. Fluent: one or two words.

## 5. Index pages

- Polaris: plural title, create as primary at the top end, one column, filters
  sort and bulk actions on the table, row opens detail, paginate above 50, at
  most 2–3 promoted filters, action-led empty state, condensed on phones
  (P:patterns/resource-index-layout/variants/default.mdx,
  P:components/lists/resource-list.mdx,
  P:components/selection-and-input/index-filters.mdx,
  P:components/layout-and-structure/empty-state.mdx).
- Carbon: toolbar with search, filters, settings and primary; selection
  replaces it with a batch bar with Cancel; overflow menu per row (inline
  icons under three actions); pagination at the bottom; rows 24–64px
  (https://carbondesignsystem.com/components/data-table/usage/).
- Primer: several row actions go in a menu, at most one pulled out
  (https://primer.style/product/components/data-table/).
- Atlassian: delete in the more-actions menu; edit in a dialog or page, never
  inline inputs.
- shadcn tasks: 32px filter input 150–250px, faceted filters, ghost Reset,
  view options, Add at the end; ghost `•••` per row with Delete last after a
  separator; footer with selection count, rows per page, page x of y
  (https://ui.shadcn.com/examples/tasks).

## 6. Top bar

- Carbon separates global (navigation, notifications, account) from local
  actions; utility icons open panels (https://carbondesignsystem.com/patterns/global-header/).
- Polaris: title and actions belong to the page; the save bar takes over.
- Primer PageHeader: parent link on narrow screens; trailing actions collapse
  into overflow (https://primer.style/product/components/page-header/).
- Atlassian: one page header, breadcrumbs above the title, actions end
  (https://atlassian.design/components/page-header/usage).
- shadcn dashboard-01: sticky 48px bar with title and one Quick Create.
- Notion and Linear: breadcrumbs at the start, page actions at the end; search
  and inbox in the sidebar.

## 7. Type and spacing

- Interface body text 14/20 (Carbon, Atlassian, Fluent, Primer); Polaris 13/20.
- Page titles: Polaris 20 bold, Primer 20 (32 large), Atlassian 24–28, Fluent
  24/32, shadcn tasks 24 semibold.
- Section headings 16 (Primer, Atlassian, Fluent Subtitle 2 16/22); card
  headings 14 semibold (Polaris).
- 4px grid everywhere; Carbon steps 2, 4, 8, 12, 16, 24, 32, 40, 48, 64.
- Arabic (Apple HIG): mirror layout and back/forward chevrons, flip progress,
  never reverse digits, enlarge Arabic about 2pt beside Latin capitals
  (https://developer.apple.com/design/human-interface-guidelines/right-to-left).

## Recommendation adopted

- Editor top bar: Back, breadcrumb, status; end: save state (Saving…, Saved,
  Couldn't save · Retry), Preview, Publish as only primary (Schedule… when
  dated), `•••` with Duplicate, Copy link, Version history, then Delete with
  confirmation. Drafts autosave about 1.5s after changes and on blur;
  Ctrl/Cmd+S saves now; published items hold edits for Update.
- Body: document title 30/38 semibold, body 16/26, content column about 720px,
  item settings in a 280px side panel.
- Settings: two columns from 1024px (280px heading and description, card with
  fields), each card with its own Save at the start of its footer, max 960px,
  40px between sections. Records: one form up to 680px, Save and Cancel at the
  bottom start, sticky only when taller than the screen, Danger zone last.
- Field: label (14 medium), hint (13/18 muted) between label and control,
  control 36px, error (13 danger with icon) replacing the hint; 24px between
  fields; "(optional)" without asterisks; validation on submit then live; error
  summary for forms over five fields; Save never disabled except in flight;
  widths by content.
- Status: five tones; pill for lifecycle, dot and text for dense spots; Draft
  neutral, Scheduled info, Published success, Pending warning, Overdue danger,
  Archived muted.
- Index: title with muted count, create at the end; 32px toolbar (search
  240px, up to three facets, Reset, view menu); batch bar on selection; 48px
  rows, row opens record, `•••` last; pagination 25–50; action-led empty
  state; cards below 768px.
- Shell: one 48px bar (toggle and breadcrumb at the start, page actions at the
  end); search, notifications and account in the sidebar; phones keep the bell
  and collapse page actions into `•••`; padding 24px (16 on phones).
