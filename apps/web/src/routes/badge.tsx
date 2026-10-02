import { BADGE_SECRET } from "@faridalms/domain/identity-schema";
import { buttonVariants } from "@faridalms/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Clock, LoaderCircle, QrCode, TriangleAlert } from "lucide-react";
import { useEffect, useEffectEvent, useRef } from "react";
import * as v from "valibot";

import { ReadAloud } from "~/components/learning/ReadAloud";
import { LocaleToggle } from "~/components/theme/LocaleToggle";
import * as m from "~/i18n/messages";
import { badgeLogin } from "~/server/auth";

export const Route = createFileRoute("/badge")({
  validateSearch: v.object({ school: v.optional(v.string()) }),
  head: () => ({ meta: [{ name: "referrer", content: "no-referrer" }] }),
  component: BadgePage,
});

class NoBadge extends Error {}

function isTooMany(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "TOO_MANY_REQUESTS"
  );
}

/**
 * Where a scanned badge lands. The secret rides in the fragment, which the
 * browser never sends to a server or puts in a referrer, and it leaves the
 * address bar and history before the sign-in starts.
 */
function BadgePage() {
  const { school } = Route.useSearch();
  const router = useRouter();
  const queryClient = useQueryClient();
  const signIn = useServerFn(badgeLogin);
  const started = useRef(false);
  const login = useMutation({
    meta: { inlineError: true },
    mutationFn: async (secret: string) => {
      if (!school || !BADGE_SECRET.test(secret)) throw new NoBadge();
      return signIn({ data: { school, secret } });
    },
    onSuccess: async () => {
      queryClient.clear();
      await router.invalidate();
      await router.navigate({ to: "/", replace: true });
    },
  });

  // A second badge scanned while this page is still open changes only the
  // fragment, which loads nothing, so the change itself starts the sign-in.
  const take = useEffectEvent(() => {
    const secret = window.location.hash.slice(1);
    if (!secret && started.current) return;
    started.current = true;
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + window.location.search,
    );
    login.mutate(secret);
  });
  useEffect(() => {
    take();
    window.addEventListener("hashchange", take);
    return () => window.removeEventListener("hashchange", take);
  }, []);

  const failed = login.error;
  const message = !failed
    ? m.badgeSigningIn()
    : failed instanceof NoBadge
      ? m.badgeScan()
      : isTooMany(failed)
        ? m.badgeTooMany()
        : m.badgeStopped();
  const Icon = !failed
    ? LoaderCircle
    : failed instanceof NoBadge
      ? QrCode
      : isTooMany(failed)
        ? Clock
        : TriangleAlert;

  return (
    <main className="grid min-h-dvh grid-rows-[auto_1fr] bg-background">
      <div className="flex justify-end p-4">
        <LocaleToggle />
      </div>
      <div className="mx-auto grid max-w-md content-center justify-items-center gap-6 px-6 pb-16 text-center">
        <span
          aria-hidden
          className={
            failed
              ? "grid size-28 place-items-center rounded-full bg-warning/20 text-warning-foreground dark:text-warning"
              : "grid size-28 place-items-center rounded-full bg-primary/15 text-primary"
          }
        >
          <Icon className={failed ? "size-14" : "size-14 animate-spin"} />
        </span>
        <div className="flex items-center gap-3">
          <h1
            role={failed ? "alert" : "status"}
            className="text-2xl leading-9 font-semibold text-balance"
          >
            {message}
          </h1>
          {failed ? <ReadAloud text={message} size="large" /> : null}
        </div>
        {failed ? (
          <Link
            to="/sign-in"
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            {m.badgeAdults()}
          </Link>
        ) : null}
      </div>
    </main>
  );
}
