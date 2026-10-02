import { westernDigits } from "@faridalms/domain/answers";
import { Button } from "@faridalms/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@faridalms/ui/dialog";
import { Input } from "@faridalms/ui/input";
import { SidebarMenuButton } from "@faridalms/ui/sidebar";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CircleAlert, LoaderCircle, Lock } from "lucide-react";
import { useId, useState } from "react";

import * as m from "~/i18n/messages";
import { endChildMode } from "~/server/auth";
import { formatNumber } from "~/utils/datetime";

// Two factors from 6 to 9: a sum a grown-up does at a glance and a child
// under eight has not met yet, asked as a number to type, never to tap.
const factor = () => 6 + Math.floor(Math.random() * 4);
const question = () => ({ a: factor(), b: factor() });

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
  const [asked, setAsked] = useState(question);
  const [answer, setAnswer] = useState("");
  const [missed, setMissed] = useState(false);
  const field = useId();
  const leave = useMutation({
    mutationFn: () => end(),
    onSuccess: async () => {
      queryClient.clear();
      await router.invalidate();
      await router.navigate({ to: "/" });
    },
  });

  const reset = () => {
    setAsked(question());
    setAnswer("");
    setMissed(false);
  };
  const check = () => {
    if (Number(westernDigits(answer.trim())) === asked.a * asked.b) {
      leave.mutate();
      return;
    }
    setAsked(question());
    setAnswer("");
    setMissed(true);
  };

  return (
    <>
      <SidebarMenuButton
        size="lg"
        className="h-11 gap-2.5 px-2"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Lock aria-hidden className="size-4" />
        <span className="truncate text-sm font-medium">
          {m.childGrownUps()}
        </span>
      </SidebarMenuButton>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!leave.isPending) setOpen(next);
        }}
      >
        <DialogContent className="gap-5 sm:max-w-sm">
          <div className="grid gap-2">
            <DialogTitle className="text-base font-semibold">
              {m.childGateTitle()}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {m.childGateAsk()}
            </DialogDescription>
          </div>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              check();
            }}
          >
            <label
              htmlFor={field}
              className="text-center text-3xl font-semibold tabular-nums"
              dir="ltr"
            >
              {formatNumber(asked.a)} × {formatNumber(asked.b)}
            </label>
            <Input
              id={field}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              inputMode="numeric"
              autoComplete="off"
              className="h-12 text-center text-xl"
              aria-describedby={missed ? `${field}-missed` : undefined}
            />
            {missed ? (
              <p
                id={`${field}-missed`}
                role="alert"
                className="flex items-center gap-1.5 text-[13px] leading-[18px] text-destructive"
              >
                <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                {m.childGateWrong()}
              </p>
            ) : null}
            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={leave.isPending}
                onClick={() => setOpen(false)}
              >
                {m.docCancel()}
              </Button>
              <Button type="submit" disabled={leave.isPending || !answer}>
                {leave.isPending ? (
                  <LoaderCircle aria-hidden className="animate-spin" />
                ) : null}
                {m.childGateContinue()}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
