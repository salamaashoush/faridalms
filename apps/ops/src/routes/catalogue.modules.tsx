import type { Column, DataTableCard } from "@faridalms/ui/system/data-table";

import { DataTable } from "@faridalms/ui/system/data-table";
import { Page } from "@faridalms/ui/system/page";
import { PageHeader } from "@faridalms/ui/system/page-header";
import { useSheet } from "@faridalms/ui/system/sheet-form";
import { StatusText } from "@faridalms/ui/system/status";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Blocks, CircleOff, CirclePlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { attempt } from "../actions";
import { ReasonSheet } from "../components/ReasonSheet";
import { formatWhen, MODULE_HINTS, MODULE_NAMES } from "../format";
import { getOffers, setOffer } from "../server/catalogue";

export const Route = createFileRoute("/catalogue/modules")({
  staticData: { title: "Modules on offer" },
  loader: () => getOffers(),
  component: ModulesOnOffer,
});

type Offer = Awaited<ReturnType<typeof getOffers>>[number];

const COLUMNS: Column<Offer>[] = [
  {
    id: "module",
    header: "Module",
    primary: true,
    cell: (offer) => (
      <span className="grid min-w-0 py-2">
        <span className="font-medium">{MODULE_NAMES[offer.module]}</span>
        <span className="truncate text-[13px] leading-[18px] text-muted-foreground">
          {MODULE_HINTS[offer.module]}
        </span>
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: (offer) => <OfferStatus offered={offer.offered} />,
  },
  {
    id: "changed",
    header: "Decided",
    width: "medium",
    cell: (offer) =>
      offer.changedAt ? (
        formatWhen(offer.changedAt)
      ) : (
        <span className="text-muted-foreground">As the module declares</span>
      ),
  },
];

const CARD: DataTableCard<Offer> = {
  title: (offer) => MODULE_NAMES[offer.module],
  status: (offer) => <OfferStatus offered={offer.offered} />,
  fact: (offer) => MODULE_HINTS[offer.module],
};

interface OfferStatusProps {
  offered: boolean;
}

function OfferStatus({ offered }: OfferStatusProps) {
  return (
    <StatusText tone={offered ? "success" : "neutral"}>
      {offered ? "On offer" : "Not on offer"}
    </StatusText>
  );
}

/**
 * Which modules a school that lacks one sees on its plan card and may ask
 * about. A school always sees the modules it has, offered or not.
 */
function ModulesOnOffer() {
  const offers = Route.useLoaderData();
  const router = useRouter();
  const send = useServerFn(setOffer);
  const sheet = useSheet();
  const [chosen, setChosen] = useState<Offer | null>(null);
  const choose = (offer: Offer) => {
    setChosen(offer);
    sheet.show();
  };
  return (
    <Page width="list">
      <PageHeader
        title="Modules on offer"
        description="A school that lacks a module on offer sees it on its plan card and may ask about it; one off offer is not named there. Schools see a change within a minute."
      />
      <DataTable
        caption="Modules on offer"
        rows={offers}
        columns={COLUMNS}
        rowLabel={(offer) => MODULE_NAMES[offer.module]}
        card={CARD}
        rowActions={(offer) => [
          offer.offered
            ? {
                label: "Take off offer",
                icon: CircleOff,
                onSelect: () => choose(offer),
              }
            : {
                label: "Put on offer",
                icon: CirclePlus,
                onSelect: () => choose(offer),
              },
        ]}
        empty={{
          icon: Blocks,
          title: "No modules",
          description: "The product has no modules to offer.",
        }}
      />
      <ReasonSheet
        key={sheet.key}
        open={sheet.open}
        onOpenChange={sheet.onOpenChange}
        title={
          chosen?.offered
            ? `Take ${MODULE_NAMES[chosen.module]} off offer`
            : `Put ${chosen ? MODULE_NAMES[chosen.module] : "a module"} on offer`
        }
        submitLabel={chosen?.offered ? "Take off offer" : "Put on offer"}
        destructive={chosen?.offered ?? false}
        placeholder={
          chosen?.offered
            ? "For example: not ready to sell yet"
            : "For example: ready to sell"
        }
        onSubmit={async (reason) => {
          if (!chosen) return null;
          const offered = !chosen.offered;
          const failed = await attempt(
            () => send({ data: { module: chosen.module, offered, reason } }),
            "The offer could not be changed.",
          );
          if (failed) return failed;
          toast.success(
            offered
              ? `${MODULE_NAMES[chosen.module]} is on offer.`
              : `${MODULE_NAMES[chosen.module]} is off offer.`,
          );
          await router.invalidate();
          return null;
        }}
      />
    </Page>
  );
}
