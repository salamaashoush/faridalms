import { SidebarMenuButton } from "@faridalms/ui/sidebar";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { useState } from "react";

import { useSessionChange } from "~/hooks/useSessionChange";
import * as m from "~/i18n/messages";
import { endChildMode } from "~/server/auth";

import { GrownUpQuestion } from "./GrownUpQuestion";

/**
 * The way back from a hand-over. A young child holds the device, so leaving
 * their lessons for the guardian's account asks a question a grown-up
 * answers and a child cannot.
 */
export function GrownUpGate() {
  const sessionChanged = useSessionChange();
  const end = useServerFn(endChildMode);
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const leave = useMutation({
    mutationFn: () => end(),
    onSuccess: async () => {
      await sessionChanged("/");
    },
  });

  return (
    <>
      <SidebarMenuButton
        size="lg"
        className="h-11 gap-2.5 px-2"
        onClick={() => {
          setRound((current) => current + 1);
          setOpen(true);
        }}
      >
        <Lock aria-hidden className="size-4" />
        <span className="truncate text-sm font-medium">
          {m.childGrownUps()}
        </span>
      </SidebarMenuButton>
      <GrownUpQuestion
        key={round}
        open={open}
        onOpenChange={setOpen}
        onPass={() => leave.mutate()}
        pending={leave.isPending}
      />
    </>
  );
}
