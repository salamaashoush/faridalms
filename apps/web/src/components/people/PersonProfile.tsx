import type { HeaderFact } from "@faridalms/ui/system/record-page";

import { initialsOf } from "@faridalms/ui/system/app-shell";
import { RecordColumns, RecordHeader } from "@faridalms/ui/system/record-page";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";
import { useState } from "react";

import { NewMessage } from "~/components/messages/NewMessage";
import { MESSAGES } from "~/components/notifications/format";
import { inLocale, useCurrentUser } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { personProfileQuery } from "~/queries/students";
import { formatList } from "~/utils/datetime";

import { displayName, labelOf, otherName, roleLabel } from "./format";
import { TeachingSection } from "./PersonRecord";

export interface PersonProfileProps {
  userId: string;
}

/**
 * The limited profile of a teacher of the viewer's classes, or of someone
 * they share a conversation with: name, photo and role, what they teach the
 * viewer or their children, and a way to write to them.
 */
export function PersonProfile({ userId }: PersonProfileProps) {
  const data = useSuspenseQuery(personProfileQuery(userId)).data;
  const { workspace } = useCurrentUser();
  const navigate = useNavigate();
  const [writing, setWriting] = useState(false);
  const name = displayName(data);
  const facts: HeaderFact[] = [];
  const second = otherName(data);
  if (second)
    facts.push({
      label: m.peopleOtherName(),
      value: <span dir="auto">{second}</span>,
    });
  if (data.roles.length)
    facts.push({
      label: m.profileRole(),
      value: (
        <span dir="auto">
          {formatList(
            data.roles.map(
              (role) =>
                inLocale(role.titleEn, role.titleAr) ||
                labelOf(role.position) ||
                roleLabel(role.role),
            ),
          )}
        </span>
      ),
    });
  return (
    <div className="mx-auto w-full max-w-6xl">
      <RecordHeader
        title={name}
        initials={initialsOf(name)}
        photoUrl={data.photoFileId ? `/files/${data.photoFileId}` : null}
        facts={facts}
        action={
          data.access.message
            ? {
                label: m.profileMessage(),
                icon: MessageSquare,
                onClick: () => setWriting(true),
              }
            : undefined
        }
      />
      {data.teaching ? (
        <RecordColumns
          main={
            <TeachingSection
              teaching={data.teaching}
              {...(workspace === "me"
                ? {
                    title: m.profileTeachesYou(),
                    empty: m.profileTeachesYouNone(),
                  }
                : workspace === "family"
                  ? {
                      title: m.profileTeachesChild(),
                      empty: m.profileTeachesChildNone(),
                    }
                  : {})}
            />
          }
        />
      ) : null}
      {writing ? (
        <NewMessage
          canStartFamily={false}
          to={{ id: userId, name }}
          onClose={() => setWriting(false)}
          onStarted={(thread) => {
            setWriting(false);
            if (thread)
              void navigate({ to: MESSAGES[workspace], search: { thread } });
          }}
        />
      ) : null}
    </div>
  );
}
