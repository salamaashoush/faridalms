import { Button } from "@faridalms/ui/button";
import { Skeleton } from "@faridalms/ui/skeleton";
import { RecordEmpty, RecordSection } from "@faridalms/ui/system/record-page";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus } from "lucide-react";
import { Suspense } from "react";
import { toast } from "sonner";

import { Conversation } from "~/components/messages/Conversation";
import * as m from "~/i18n/messages";
import { openApplicationConversation } from "~/server/admissions";
import { getMessageFromError } from "~/utils/error";
import { useWords } from "~/utils/words";

export interface FamilyConversationProps {
  applicationId: string;
  threadId: string | null;
  childName: string;
  manages: boolean;
}

/**
 * Where an application page shows the family's conversation with the
 * school. Every word exchanged with a family belongs to the Messages
 * system, so this section draws that conversation and keeps none of its
 * own; the history below it holds only the office's notes and changes.
 */
export function FamilyConversation({
  applicationId,
  threadId,
  childName,
  manages,
}: FamilyConversationProps) {
  const words = useWords();
  const queryClient = useQueryClient();
  const open = useMutation({
    mutationFn: () =>
      openApplicationConversation({ data: { id: applicationId } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admissions"] }),
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  return (
    <RecordSection
      title={words(m.aplSectionConversationCore)()}
      description={words(m.aplSectionConversationHintCore)()}
    >
      {threadId ? (
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <Conversation
            threadId={threadId}
            embedded
            fields={{ child: childName }}
          />
        </Suspense>
      ) : manages ? (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start max-md:h-10"
          disabled={open.isPending}
          onClick={() => open.mutate()}
        >
          <MessageSquarePlus aria-hidden />
          {words(m.aplConversationStartCore)()}
        </Button>
      ) : (
        <RecordEmpty>{m.aplConversationNone()}</RecordEmpty>
      )}
    </RecordSection>
  );
}
