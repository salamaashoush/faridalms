import { Button, buttonVariants } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Input } from "@faridalms/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@faridalms/ui/system/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHydrated } from "@tanstack/react-router";
import { CalendarSync, Check, Copy } from "lucide-react";
import { useState } from "react";

import * as m from "~/i18n/messages";
import { calendarFeedQuery } from "~/queries/calendar";
import { resetCalendarFeed } from "~/server/calendar";
import { formatAgo, formatDate } from "~/utils/datetime";
import { getMessageFromError } from "~/utils/error";

/**
 * A private link that puts the viewer's calendar in the phone or desktop
 * calendar they already use. The secret is shown once, when made; after that
 * it can only be replaced, which stops the old one.
 */
export function Subscribe() {
  const hydrated = useHydrated();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const feed = useQuery({ ...calendarFeedQuery, enabled: open });
  const reset = useMutation({
    mutationFn: () => resetCalendarFeed(),
    onSuccess: async (result) => {
      setMade(
        `${window.location.origin}/feeds/${result.school}/${result.token}.ics`,
      );
      setCopied(false);
      await queryClient.invalidateQueries({ queryKey: ["calendar", "feed"] });
    },
  });
  const webcal = made ? made.replace(/^https?:/, "webcal:") : "";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className="max-md:size-10 max-md:px-0"
            disabled={!hydrated}
          />
        }
      >
        <CalendarSync aria-hidden />
        <span className="max-md:sr-only">{m.calSubscribe()}</span>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>{m.calSubscribeTitle()}</DialogTitle>
        <DialogDescription>{m.calSubscribeHint()}</DialogDescription>
        {made ? (
          <div className="grid gap-3">
            <div className="flex gap-2">
              <Input
                readOnly
                dir="ltr"
                aria-label={m.calSubscribeLink()}
                value={made}
                onFocus={(event) => event.currentTarget.select()}
                className="max-md:h-10"
              />
              <Button
                type="button"
                variant="outline"
                className="max-md:h-10"
                onClick={() => {
                  void navigator.clipboard.writeText(made).then(() => {
                    setCopied(true);
                  });
                }}
              >
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copied ? m.calSubscribeCopied() : m.calSubscribeCopy()}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "max-md:h-10",
                )}
              >
                {m.calSubscribeGoogle()}
              </a>
              <a
                href={webcal}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "max-md:h-10",
                )}
              >
                {m.calSubscribeApple()}
              </a>
            </div>
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {m.calSubscribeOnce()}
            </p>
          </div>
        ) : feed.data ? (
          <div className="grid gap-3">
            <p className="text-sm">
              {m.calSubscribeExisting({
                date: formatDate(feed.data.createdAt),
                read: feed.data.lastFetchedAt
                  ? formatAgo(feed.data.lastFetchedAt)
                  : m.calSubscribeNeverRead(),
              })}
            </p>
            <Button
              type="button"
              className="justify-self-start max-md:h-10"
              disabled={reset.isPending}
              onClick={() => reset.mutate()}
            >
              {m.calSubscribeReset()}
            </Button>
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {m.calSubscribeResetHint()}
            </p>
          </div>
        ) : (
          <Button
            type="button"
            className="justify-self-start max-md:h-10"
            disabled={reset.isPending || feed.isPending}
            onClick={() => reset.mutate()}
          >
            {m.calSubscribeMake()}
          </Button>
        )}
        {reset.error ? (
          <p role="alert" className="text-sm text-destructive">
            {getMessageFromError(reset.error)}
          </p>
        ) : null}
        <p className="text-[13px] leading-[18px] text-muted-foreground">
          {m.calSubscribeDelay()}
        </p>
      </DialogContent>
    </Dialog>
  );
}
