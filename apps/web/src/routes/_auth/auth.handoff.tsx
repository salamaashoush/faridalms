import { buttonVariants } from "@faridalms/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useEffect, useRef } from "react";

import * as m from "~/i18n/messages";
import { redeemHandoff } from "~/server/auth";
import { leaveBareDomain } from "~/utils/bare-domain";

export const Route = createFileRoute("/_auth/auth/handoff")({
  beforeLoad: ({ context }) =>
    leaveBareDomain(context.auth, "/sign-in", { otherwise: "/sign-in" }),
  head: () => ({ meta: [{ name: "referrer", content: "no-referrer" }] }),
  component: HandoffPage,
});

/**
 * Where sign-in on the bare portal domain lands, on the school's own portal.
 * The handoff rides in the fragment, which leaves the address bar before it
 * is spent, and this portal's server turns it into the session.
 */
function HandoffPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const redeem = useServerFn(redeemHandoff);
  const started = useRef(false);
  const handoff = useMutation({
    meta: { inlineError: true },
    mutationFn: (token: string) => redeem({ data: { token } }),
    onSuccess: async () => {
      queryClient.clear();
      await router.invalidate();
      await router.navigate({ to: "/", replace: true });
    },
  });
  const spend = handoff.mutate;
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = window.location.hash.slice(1);
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname,
    );
    spend(token);
  }, [spend]);

  if (!handoff.isError)
    return (
      <output className="flex items-center gap-3 text-lg">
        <LoaderCircle aria-hidden className="size-5 animate-spin" />
        {m.handoffWorking()}
      </output>
    );
  return (
    <div className="grid justify-items-start gap-4">
      <span
        aria-hidden
        className="grid size-12 place-items-center rounded-full bg-warning/20 text-warning-foreground dark:text-warning"
      >
        <TriangleAlert className="size-6" />
      </span>
      <div className="grid gap-2">
        <h1 role="alert" className="text-2xl leading-8 font-semibold">
          {m.handoffFailed()}
        </h1>
        <p className="text-muted-foreground">{m.handoffFailedBody()}</p>
      </div>
      <Link to="/sign-in" className={buttonVariants({ variant: "outline" })}>
        {m.handoffAgain()}
      </Link>
    </div>
  );
}
