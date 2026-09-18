# Farida LMS interaction design

The platform serves school administrators, teachers, parents, and students. School identity belongs to the tenant; Farida LMS identifies the platform.

Directories share one DataTable: the same search field, filter placement, sortable headers, row actions, empty state, and pagination. Queries execute against the backend and live in the URL. A labeled scroll region preserves the full table on small screens.

Complex editors are full pages with persistent URLs, grouped fields, validation feedback, unsaved-change protection and accessible save actions. Dialogs are for short focused actions. Editors share field and action components. Searchable relationship pickers retrieve bounded results from the authorized school database. No form relies on a client-side role check for authorization.

Calendars share one CalendarPage for every role. Month, week, and agenda views use the same date controls, category colors, and event detail dialog. School administrators can create, edit, move, and resize school events. Other roles inspect events. Event revisions prevent an older browser from overwriting a newer edit.

Dashboards should prioritize the next useful action and the records behind it. Decorative introductions must not push coursework, grading, attendance, or a child's progress below the first screen. Comparable summaries use the same spacing, type hierarchy, and status colors.

All product copy has English and Arabic translations. Layout uses logical CSS properties and respects the document direction. School-authored content is displayed as authored. Dates use the school's timezone; date-only values must not shift when viewed from another timezone.

A workflow is complete when a person can initiate it, correct invalid input, save it, reload and see the persisted result, and receive a useful error if their permission or the record has changed. Browser tests exercise those steps against separate school databases.

Shared class, student and person records are the primary navigation structure. The role changes available sections and actions, not the visual structure of the same record. Student profiles include contacts, emergency contacts, medical information, enrollment and learning history. Sensitive sections require separate authorization and return no restricted data to the browser.

The application shell follows the shadcn sidebar-07 and dashboard-01 compositions: collapsible navigation, a compact contextual header, and one content inset. The inbox follows sidebar-09's separation of folder navigation, message list and reading pane. The tasks example supplies compact faceted filters, view options and pagination. These are source references, not permission to copy placeholder links or disconnected demo behavior.

A record page has a breadcrumb, identity header, primary action and URL-backed tabs. The body uses a primary content column and supporting context when useful. A linked class name opens its class record; a student's name opens their profile; a teaching contact opens the permitted person profile. On mobile, tabs scroll without compressing their labels and supporting panels stack below the main task.
