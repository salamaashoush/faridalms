import { SidebarMenuButton } from "@faridalms/ui/sidebar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Lock } from "lucide-react";
import { useState } from "react";

import * as m from "~/i18n/messages";
import { endChildMode } from "~/server/auth";

import { GrownUpQuestion } from "./GrownUpQuestion";

/**
 * The way back from a hand-over. A young child holds the device, so leaving
 * their lessons for the guardian's account asks a question a grown-up
 * answers and a child cannot.
 */
export function GrownUpGate() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const end = useServerFn(endChildMode);
  const [open, setOpen] = useState(false);
  const [round, setRound] = useState(0);
  const leave = useMutation({
    mutationFn: () => end(),
    onSuccess: async () => {
      queryClient.clear();
      await router.invalidate();
      await router.navigate({ to: "/" });
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
