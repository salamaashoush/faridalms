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
import { CircleAlert, LoaderCircle } from "lucide-react";
import { useId, useState } from "react";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

// Two factors from 6 to 9: a sum a grown-up does at a glance and a child
// under eight has not met yet, asked as a number to type, never to tap.
const factor = () => 6 + Math.floor(Math.random() * 4);
const question = () => ({ a: factor(), b: factor() });

export interface GrownUpQuestionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPass: () => void;
  pending?: boolean;
}

/**
 * A question a grown-up answers and a young child cannot, before leaving a
 * screen a child holds or stands at. A wrong answer asks another; mount it
 * afresh for each opening to ask a new one.
 */
export function GrownUpQuestion({
  open,
  onOpenChange,
  onPass,
  pending = false,
}: GrownUpQuestionProps) {
  const [asked, setAsked] = useState(question);
  const [answer, setAnswer] = useState("");
  const [missed, setMissed] = useState(false);
  const field = useId();

  const check = () => {
    if (Number(westernDigits(answer.trim())) === asked.a * asked.b) {
      onPass();
      return;
    }
    setAsked(question());
    setAnswer("");
    setMissed(true);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
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
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {m.docCancel()}
            </Button>
            <Button type="submit" disabled={pending || !answer}>
              {pending ? (
                <LoaderCircle aria-hidden className="animate-spin" />
              ) : null}
              {m.childGateContinue()}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
