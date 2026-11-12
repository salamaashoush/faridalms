import { BreadcrumbCurrent } from "@faridalms/ui/system/app-shell";
import { Page } from "@faridalms/ui/system/page";
import { RecordEmpty, RecordHeader } from "@faridalms/ui/system/record-page";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import type { StandardRow } from "~/components/standards/Standards";

import {
  FrameworkSheet,
  sourceOf,
  StandardSheet,
  StandardsTree,
} from "~/components/standards/Standards";
import * as m from "~/i18n/messages";
import { frameworkQuery } from "~/queries/standards";
import { removeFramework } from "~/server/standards";

export const Route = createFileRoute("/_app/standards/$frameworkId")({
  staticData: { trail: <FrameworkTrail />, section: "/standards" },
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      frameworkQuery(params.frameworkId),
    );
  },
  component: FrameworkPage,
});

function FrameworkTrail() {
  const { frameworkId } = Route.useParams();
  const data = useSuspenseQuery(frameworkQuery(frameworkId)).data;
  return <BreadcrumbCurrent>{data.framework.title}</BreadcrumbCurrent>;
}

type Sheet =
  | { kind: "framework" }
  | { kind: "standard"; standard: StandardRow | null; parentId: string };

function FrameworkPage() {
  const { frameworkId } = Route.useParams();
  const data = useSuspenseQuery(frameworkQuery(frameworkId)).data;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [key, setKey] = useState(0);
  const open = (next: Sheet) => {
    setKey((current) => current + 1);
    setSheet(next);
  };
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["standards"] });
  const { framework, standards, canManage } = data;
  return (
    <Page width="record">
      <RecordHeader
        title={framework.title}
        facts={[
          {
            label: m.standardsCount(),
            value: m.standardsCountOf({ count: standards.length }),
          },
          {
            label: m.standardsSource(),
            value: sourceOf(framework),
          },
        ]}
        action={
          canManage
            ? {
                label: m.standardsAdd(),
                icon: Plus,
                onClick: () =>
                  open({ kind: "standard", standard: null, parentId: "" }),
              }
            : undefined
        }
        menu={
          canManage
            ? [
                {
                  label: m.standardsEditFramework(),
                  icon: Pencil,
                  onSelect: () => open({ kind: "framework" }),
                },
                {
                  label: m.standardsRemoveFramework(),
                  icon: Trash2,
                  destructive: true,
                  confirm: {
                    title: m.standardsRemoveFrameworkTitle(),
                    body: m.standardsRemoveFrameworkBody({
                      framework: framework.title,
                    }),
                    label: m.standardsRemoveFramework(),
                  },
                  onSelect: async () => {
                    await removeFramework({ data: { id: framework.id } });
                    await refresh();
                    await navigate({ to: "/standards" });
                  },
                },
              ]
            : []
        }
      />
      {framework.description ? (
        <p
          dir="auto"
          className="-mt-2 mb-6 max-w-prose text-sm leading-5 text-muted-foreground"
        >
          {framework.description}
        </p>
      ) : null}
      {standards.length === 0 ? (
        <RecordEmpty>{m.standardsFrameworkEmpty()}</RecordEmpty>
      ) : (
        <StandardsTree
          key={framework.id}
          standards={standards}
          canManage={canManage}
          onEdit={(standard) =>
            open({ kind: "standard", standard, parentId: "" })
          }
          onAddUnder={(parentId) =>
            open({ kind: "standard", standard: null, parentId })
          }
        />
      )}
      {canManage ? (
        <>
          <FrameworkSheet
            key={`framework-${key}`}
            open={sheet?.kind === "framework"}
            onClose={() => setSheet(null)}
            framework={framework}
            onSaved={refresh}
          />
          <StandardSheet
            key={`standard-${key}`}
            open={sheet?.kind === "standard"}
            onClose={() => setSheet(null)}
            frameworkId={framework.id}
            standards={standards}
            standard={sheet?.kind === "standard" ? sheet.standard : null}
            parentId={sheet?.kind === "standard" ? sheet.parentId : ""}
            onSaved={refresh}
          />
        </>
      ) : null}
    </Page>
  );
}
