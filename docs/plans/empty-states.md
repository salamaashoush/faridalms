# Empty states

Every place in the portal (`apps/web`) and the console (`apps/ops`) that
says a page, a list, a section or a value has nothing in it, as found at
`ba86e23f`, and what draws it now. The rules are in
`docs/design-system.md`, Empty states; `scripts/empty-states.spec.ts`
fails on a new hand-drawn one.

Kinds: **page** (a page or tab with nothing yet), **filtered** (a search or
filter that matched nothing), **section** (a section, card, panel, sheet or
popover list with nothing), **value** (an inline value or table cell),
**done** (nothing left to do), **restricted** (something the viewer may not
see or the school cannot use).

## Already drawn by the design system

These needed no change at the call site. The ones inside a section now
draw as the section's line by themselves, through `EmptyStateScope` in
`RecordSection`, `SettingsSection` and `PanelGroup`; the Admission reports
page's three tables, which each drew a dashed box with a chart icon inside
their card, are the case that showed it.

| Where                                                     | Count | Kind                    |
| --------------------------------------------------------- | ----- | ----------------------- |
| `DataTable` and `MediaGrid` `empty` in the portal         | 77    | page, or section in one |
| `DataTable` `empty` in the console                        | 32    | page, or section in one |
| `EmptyState` in the portal                                | 50    | page, or section in one |
| `EmptyState` in the console                               | 1     | page                    |
| `RecordEmpty` in the portal                               | 72    | section                 |
| `RecordEmpty` in the console                              | 2     | section                 |
| `AttentionList empty` (portal and console home pages)     | 4     | done                    |
| Filtered tables and grids (`FilteredEmptyState` built in) | all   | filtered                |

## Drawn by hand, now replaced

Lines are at `ba86e23f`.

| Place                                                                     | Kind       | Was                                | Now                                 |
| ------------------------------------------------------------------------- | ---------- | ---------------------------------- | ----------------------------------- |
| `apps/web/src/routes/_app/_staff/billing.tsx:170`                         | page       | muted paragraph                    | `EmptyState`, with a sentence       |
| `apps/web/src/routes/_app/_staff/billing.tsx:202`                         | section    | muted line under a bare heading    | `EmptyState` section                |
| `apps/web/src/components/admissions/ApplicationForm.tsx:379`              | page       | bordered centred paragraph         | `EmptyState`                        |
| `apps/web/src/components/attendance/Register.tsx:789`                     | page       | card with muted text               | `EmptyState`                        |
| `apps/web/src/components/learning/PacedLesson.tsx:758`                    | page       | 24px muted line on the class board | `EmptyState`                        |
| `apps/web/src/components/app/WorkspaceSearch.tsx:352`                     | filtered   | centred title and tips             | `FilteredEmptyState` section        |
| `apps/web/src/components/messages/Inbox.tsx:507`                          | filtered   | muted paragraph, no way back       | `FilteredEmptyState`, Clear filters |
| `apps/web/src/components/learning/ModuleGlossary.tsx:100`                 | filtered   | muted paragraph                    | `FilteredEmptyState`, Clear filters |
| `apps/web/src/components/content/QuestionBank.tsx:457`                    | filtered   | muted paragraph                    | `FilteredEmptyState`, Clear filters |
| `apps/web/src/components/content/SharedBlocks.tsx:435`                    | filtered   | muted paragraph                    | `FilteredEmptyState`, Clear filters |
| `apps/web/src/components/site/studio/Gallery.tsx:198`                     | filtered   | muted paragraph                    | `FilteredEmptyState`, Clear filters |
| `apps/web/src/components/site/studio/SavedSections.tsx:535`               | filtered   | muted paragraph                    | `FilteredEmptyState` section        |
| `apps/web/src/components/coursework/UseAgain.tsx:118`                     | filtered   | muted paragraph                    | `FilteredEmptyState` section        |
| `apps/web/src/components/app/NotificationBell.tsx:90`                     | section    | muted paragraph in a menu          | `EmptyState` section                |
| `apps/web/src/components/attendance/FollowUp.tsx:164`                     | section    | muted span                         | `EmptyState` section                |
| `apps/web/src/components/calendar/views.tsx:683`                          | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/calendar/views.tsx:857`                          | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/coding/DeviceProgram.tsx:21`                     | section    | dashed centred box                 | `EmptyState` section                |
| `apps/web/src/components/coding/ProgramReplay.tsx:170`                    | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/coding/ProjectGallery.tsx:137`                   | section    | dashed box                         | `EmptyState` section                |
| `apps/web/src/components/content/DocumentHistory.tsx:97`                  | section    | muted paragraph in a sheet         | `EmptyState` section                |
| `apps/web/src/components/content/SharedBlocks.tsx:235`                    | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/content/SharedBlocks.tsx:436`                    | section    | muted paragraph in a sheet         | `EmptyState` section                |
| `apps/web/src/components/content/QuestionBank.tsx:458`                    | section    | muted paragraph in a sheet         | `EmptyState` section                |
| `apps/web/src/components/coursework/CommentBank.tsx:139`                  | section    | muted paragraph in a popover       | `EmptyState` section                |
| `apps/web/src/components/exams/ExamHistory.tsx:131`                       | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/learning/Answers.tsx:646`                        | section    | dashed centred box                 | `EmptyState` section                |
| `apps/web/src/components/learning/Checks.tsx:424`                         | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/learning/Checks.tsx:2785`                        | section    | dashed box                         | `EmptyState` section                |
| `apps/web/src/components/learning/Checks.tsx:2919`                        | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/learning/PacedLesson.tsx:489`                    | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/learning/PlanEditor.tsx:112`                     | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/learning/Videos.tsx:203`                         | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/messages/Conversation.tsx:726`                   | section    | centred list item                  | `EmptyState` section                |
| `apps/web/src/components/messages/Inbox.tsx:354`                          | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/messages/Inbox.tsx:510`                          | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/reading/ReadingNorms.tsx:234`                    | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/years/Rollover.tsx:599`                          | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/years/YearPlanner.tsx:966`                       | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/timetable/Cover.tsx:772`                         | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/site/studio/fields.tsx:1257`                     | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/site/studio/Outline.tsx:239`                     | section    | centred icon and text              | `EmptyState` section                |
| `apps/web/src/components/site/SiteAddresses.tsx:283`                      | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/standards/CurriculumMap.tsx:194`                 | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/system/FileList.tsx:66`                          | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/admissions/ApplicationForm.tsx:835`              | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/admissions/ApplicationForm.tsx:1235`             | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/routes/_app/_staff/settings.tsx:247`                        | section    | muted paragraph                    | `EmptyState` section                |
| `apps/ops/src/routes/provisioning.$draftId.tsx:529`                       | section    | muted paragraph                    | `EmptyState` section                |
| `apps/ops/src/components/QuoteForm.tsx:333`                               | section    | muted paragraph                    | `EmptyState` section                |
| `apps/ops/src/components/PriceFields.tsx:88`                              | section    | muted paragraph                    | `EmptyState` section                |
| `apps/web/src/components/attendance/FollowUp.tsx:313`                     | done       | card with a check                  | `EmptyState kind="done"`            |
| `apps/web/src/routes/_app/family/index.tsx:303`                           | done       | muted paragraph                    | `EmptyState kind="done"`            |
| `packages/ui/src/system/attention-list.tsx:74`                            | done       | its own check and line             | `EmptyState kind="done"`            |
| `apps/web/src/components/admin/AssistantSettings.tsx:102`                 | restricted | muted paragraph                    | `EmptyState kind="restricted"`      |
| `apps/web/src/components/coding/CodingAnswer.tsx:117`                     | restricted | muted paragraph                    | `EmptyState kind="restricted"`      |
| `apps/web/src/components/coding/CodingStudio.tsx:204`                     | restricted | muted paragraph                    | `EmptyState kind="restricted"`      |
| `apps/web/src/components/learning/Checks.tsx:3667`                        | restricted | dashed box                         | `EmptyState kind="restricted"`      |
| `apps/web/src/components/site/SiteAddresses.tsx:279`                      | restricted | muted paragraph                    | `EmptyState kind="restricted"`      |
| `apps/web/src/components/attendance/FollowUp.tsx:192`                     | value      | muted span                         | `Value absent`                      |
| `apps/web/src/components/coding/ProgramReplay.tsx:112`                    | value      | muted paragraph                    | `Value absent`                      |
| `apps/web/src/components/exams/ExamSessions.tsx:95`                       | value      | muted span in a cell               | `Value absent`                      |
| `apps/web/src/components/files/AreaFiles.tsx:103`                         | value      | muted span in a cell               | `Value absent`                      |
| `apps/web/src/components/media/MediaBrowser.tsx:141`                      | value      | muted span in a cell               | `Value absent`                      |
| `apps/web/src/components/media/MediaBrowser.tsx:195`                      | value      | muted span in a cell               | `Value absent`                      |
| `apps/web/src/components/media/MediaBrowser.tsx:216`                      | value      | muted span in a cell               | `Value absent`                      |
| `apps/web/src/components/people/StudentEditor.tsx:638`                    | value      | muted span                         | `Value absent`                      |
| `apps/web/src/routes/_app/_staff/assignments.tsx:116`                     | value      | muted span in a cell               | `Value absent`                      |
| `apps/web/src/routes/_app/admissions/applications/index.tsx:117`          | value      | muted span in a cell               | `Value absent`                      |
| `apps/web/src/routes/_app/admissions/applications/$applicationId.tsx:544` | value      | muted span                         | `Value absent`                      |
| `apps/web/src/routes/_app/admissions/enquiries/index.tsx:137`             | value      | muted span in a cell               | `Value absent`                      |
| `apps/ops/src/components/Usage.tsx:15`                                    | value      | muted span                         | `Value absent`                      |
| `apps/ops/src/routes/customers.index.tsx:94`                              | value      | muted span in a cell               | `Value absent`                      |
| `apps/ops/src/routes/customers.index.tsx:111`                             | value      | muted span in a cell               | `Value absent`                      |
| `apps/ops/src/routes/customers.index.tsx:136`                             | value      | muted span in a cell               | `Value absent`                      |
| `apps/ops/src/routes/invoices.$invoiceId.tsx:1040`                        | value      | muted span in a cell               | `Value absent`                      |
| `apps/ops/src/routes/leads.$leadId.tsx:504`                               | value      | muted span                         | `Value absent`                      |
| `apps/ops/src/routes/leads.index.tsx:355`                                 | value      | muted span in a cell               | `Value absent`                      |
| `apps/ops/src/routes/operators.tsx:170`                                   | value      | muted span in a cell               | `Value absent`                      |
| `apps/ops/src/routes/schools.$schoolId.tsx:638`                           | value      | muted span                         | `Value absent`                      |
| `apps/ops/src/routes/schools.$schoolId.tsx:662`                           | value      | muted span                         | `Value absent`                      |
| `apps/ops/src/routes/subscriptions.$subscriptionId.tsx:649`               | value      | muted span in a cell               | `Value absent`                      |
| `apps/ops/src/routes/subscriptions.$subscriptionId.tsx:988`               | value      | muted span                         | `Value absent`                      |
| `apps/ops/src/routes/subscriptions.index.tsx:101`                         | value      | muted span                         | `Value absent`                      |
| `apps/ops/src/routes/subscriptions.index.tsx:125`                         | value      | muted span in a cell               | `Value absent`                      |
| `apps/ops/src/routes/subscriptions.index.tsx:134`                         | value      | muted span in a cell               | `Value absent`                      |

## Left as they are

| Place                                                           | Why                                                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `apps/web/src/components/home/parts.tsx` (`HomeCard`)           | A home card with nothing in it is not drawn at all, by design; the page's To do says "nothing". |
| `apps/web/src/components/learning/LessonPlayer.tsx:195,497,572` | Gates in a lesson (wait for the teacher, a question ahead), not empty states.                   |
| `apps/web/src/components/coding/CodingAnswer.tsx:97`            | Stands where a project's stage picture goes before there is one; a placeholder, not a list.     |
| `apps/web/src/components/learning/young/*`                      | Dashed drop targets young children fill; part of the activity.                                  |
| `apps/web/src/components/messages/Inbox.tsx:311`                | A draft's preview falling back to "Nothing written yet" inside its row.                         |
| `apps/web/src/components/learning/YearMap.tsx:143`              | "No dates yet" is one of a unit's joined facts.                                                 |
| `apps/web/src/components/exams/ExamSessions.tsx:522,542`        | Hints under a form choice that explain why it is disabled.                                      |
| `apps/web/src/routes/_staff/billing.tsx` (`billingUnavailable`) | An error (billing is down), not an empty state.                                                 |
| `apps/web/src/components/site/render/**`                        | The school's public website, drawn in the site's own theme rather than the design system.       |
| `packages/editor/src/**` empty blocks (glossary, bibliography)  | Content of a document as its readers see it; the editor package draws its own blocks.           |
| Pages that crash or go blank in a school with no year           | Their data handling belongs to the first-run work.                                              |
