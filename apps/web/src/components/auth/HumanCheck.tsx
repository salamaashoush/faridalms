import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useState } from "react";

import { getLocale } from "~/i18n/runtime";
import { getHumanCheck } from "~/server/auth";

import { TurnstileWidget } from "./turnstile";

/**
 * The bare domain's human check, when the platform runs one, for its
 * sign-in, reset and the product site's demonstration form: the widget to
 * place in a form, the token it gave, whether the form may send, and
 * `spend` to ask for a fresh token after each try, since a token works once.
 */
export function useHumanCheck(
  action: "sign_in" | "reset" | "demo",
  enabled = true,
) {
  const fetchKey = useServerFn(getHumanCheck);
  const siteKey =
    useQuery({
      queryKey: ["human-check"],
      queryFn: () => fetchKey(),
      staleTime: Number.POSITIVE_INFINITY,
      // The key serves only the bare domain's forms, and asking for it
      // anywhere else is refused.
      enabled,
    }).data?.siteKey ?? null;
  const [token, setToken] = useState("");
  const [generation, setGeneration] = useState(0);
  const spend = useCallback(() => {
    setToken("");
    setGeneration((value) => value + 1);
  }, []);
  const widget = siteKey ? (
    <TurnstileWidget
      siteKey={siteKey}
      action={action}
      locale={getLocale() === "ar" ? "ar" : "en"}
      generation={generation}
      onToken={setToken}
    />
  ) : null;
  return {
    widget,
    token: siteKey ? token : undefined,
    ready: !siteKey || token !== "",
    spend,
  };
}
