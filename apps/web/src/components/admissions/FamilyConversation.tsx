import { RecordEmpty, RecordSection } from "~/components/system/RecordPage";
import * as m from "~/i18n/messages";

/**
 * Where an application page shows the family's conversation with the
 * school. Every word exchanged with a family belongs to the Messages
 * system, so this section draws that conversation and keeps none of its
 * own; the history below it holds only the office's notes and changes.
 */
export function FamilyConversation(_: {
  familyUserId: string;
  applicationId: string;
}) {
  return (
    <RecordSection
      title={m.aplSectionConversation()}
      description={m.aplSectionConversationHint()}
    >
      <RecordEmpty>{m.aplConversationNone()}</RecordEmpty>
    </RecordSection>
  );
}
