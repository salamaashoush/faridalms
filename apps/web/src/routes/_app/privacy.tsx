import { WORKSPACE_HOME } from "@faridalms/domain/workspace";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useState } from "react";
import * as v from "valibot";

import type { HoldRow, ReviewRow } from "~/components/privacy/DataProtection";
import type { HeaderAction } from "~/components/system/IndexPage";

import { displayName } from "~/components/people/format";
import {
  HoldSheet,
  HoldsTable,
  ReleaseSheet,
  RetentionSection,
  RetentionSheet,
  ReviewTable,
} from "~/components/privacy/DataProtection";
import { PageHeader } from "~/components/system/IndexPage";
import { RecordTabs } from "~/components/system/RecordPage";
import * as m from "~/i18n/messages";
import { privacyOverviewQuery } from "~/queries/privacy";
import { currentUserQuery } from "~/queries/user";

const TABS = ["review", "holds", "retention"] as const;
type Tab = (typeof TABS)[number];

const searchSchema = v.object({
  tab: v.optional(v.picklist(TABS), "review"),
});

export const Route = createFileRoute("/_app/privacy")({
  staticData: { breadcrumb: m.privacyTitle },
  validateSearch: searchSchema,
  loader: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery);
    if (!user.capabilities.includes("privacy:manage"))
      throw redirect({ to: WORKSPACE_HOME[user.workspace] });
    await context.queryClient.ensureQueryData(privacyOverviewQuery);
  },
  component: PrivacyPage,
});

type Open =
  | { kind: "hold"; person: ReviewRow | null }
  | { kind: "release"; hold: HoldRow }
  | { kind: "rules" };

function PrivacyPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const overview = useSuspenseQuery(privacyOverviewQuery).data;
  const [shown, setShown] = useState<{ open: Open; generation: number } | null>(
    null,
  );
  const [isOpen, setOpen] = useState(false);
  const show = (open: Open) => {
    setShown((current) => ({
      open,
      generation: (current?.generation ?? 0) + 1,
    }));
    setOpen(true);
  };
  const close = () => setOpen(false);
  const adds: Partial<Record<Tab, HeaderAction>> = {
    holds: {
      label: m.privacyPlaceHold(),
      icon: Lock,
      onClick: () => show({ kind: "hold", person: null }),
    },
  };
  return (
    <>
      <PageHeader
        title={m.privacyTitle()}
        description={m.privacySubtitle()}
        action={adds[tab]}
      />
      <RecordTabs
        label={m.privacyTitle()}
        tabs={[
          { value: "review", label: m.privacyReviewTab() },
          { value: "holds", label: m.privacyHoldsTab() },
          { value: "retention", label: m.privacyRetentionTab() },
        ]}
        value={tab}
        onChange={(next) => void navigate({ search: { tab: next } })}
      >
        {tab === "review" ? (
          <ReviewTable
            overview={overview}
            onHold={(person) => show({ kind: "hold", person })}
            onRelease={(hold) => show({ kind: "release", hold })}
            onRules={() => void navigate({ search: { tab: "retention" } })}
          />
        ) : tab === "holds" ? (
          <HoldsTable
            overview={overview}
            onAdd={() => show({ kind: "hold", person: null })}
            onRelease={(hold) => show({ kind: "release", hold })}
          />
        ) : (
          <RetentionSection
            rules={overview.rules}
            onEdit={() => show({ kind: "rules" })}
          />
        )}
      </RecordTabs>
      {shown?.open.kind === "hold" ? (
        <HoldSheet
          key={shown.generation}
          open={isOpen}
          person={
            shown.open.person
              ? {
                  id: shown.open.person.userId,
                  name: displayName(shown.open.person),
                }
              : null
          }
          onClose={close}
        />
      ) : shown?.open.kind === "release" ? (
        <ReleaseSheet
          key={shown.generation}
          open={isOpen}
          hold={shown.open.hold}
          onClose={close}
        />
      ) : shown?.open.kind === "rules" ? (
        <RetentionSheet
          key={shown.generation}
          open={isOpen}
          rules={overview.rules}
          onClose={close}
        />
      ) : null}
    </>
  );
}
