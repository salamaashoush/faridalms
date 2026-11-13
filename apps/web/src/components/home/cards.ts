import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { useSuspenseQueries } from "@tanstack/react-query";

import type {
  ModuleFillings,
  SchoolFace,
  Slot,
  SlotQuery,
} from "~/utils/extension";

import { useCurrentUser } from "~/hooks/useCurrentUser";
import { useSlot } from "~/hooks/useSlot";
import { filled } from "~/utils/extension";

import type { TodayCard } from "./slots";

/** A card in its place, the page's own or a module's. */
export interface PlacedCard {
  place: number;
  node: ReactNode;
}

/** Loads what the modules' cards read for this viewer, before the page draws. */
export function loadCards(
  queryClient: QueryClient,
  extensions: readonly ModuleFillings[],
  user: SchoolFace & { capabilities: readonly string[] },
  to: Slot<{
    query(capabilities: readonly string[]): SlotQuery<unknown> | null;
  }>,
) {
  return Promise.all(
    filled(extensions, user, to).flatMap((card) => {
      const query = card.query(user.capabilities);
      return query ? [queryClient.ensureQueryData(query)] : [];
    }),
  );
}

/** The cards the modules on add to a Today, by column, those that fold into a shown one left out. */
export function useModuleCards(to: Slot<TodayCard>): {
  main: PlacedCard[];
  side: PlacedCard[];
} {
  const { capabilities } = useCurrentUser();
  const asked = useSlot(to).flatMap((card) => {
    const query = card.query(capabilities);
    return query ? [{ card, query }] : [];
  });
  const reads = useSuspenseQueries({
    queries: asked.map((row) => row.query),
  });
  const drawn = asked.flatMap((row, index) => {
    const node = row.card.cardOf(reads[index]?.data);
    return node ? [{ card: row.card, node }] : [];
  });
  const shown = new Set(drawn.map((row) => row.card.key));
  const kept = drawn.filter(
    (row) => !row.card.foldsInto || !shown.has(row.card.foldsInto),
  );
  const column = (area: TodayCard["area"]) =>
    kept
      .filter((row) => row.card.area === area)
      .map((row) => ({ place: row.card.place, node: row.node }));
  return { main: column("main"), side: column("side") };
}

/** The page's own cards and the modules', in place order, empty ones gone. */
export const inPlace = (cards: readonly PlacedCard[]): ReactNode[] =>
  cards
    .filter((card) => card.node !== null && card.node !== false)
    .toSorted((a, b) => a.place - b.place)
    .map((card) => card.node);
