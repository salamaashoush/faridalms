import { useEffect, useRef } from "react";

const SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: Record<string, unknown>,
  ) => string | undefined;
  reset: (widget: string) => void;
  remove: (widget: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

/** Cloudflare's script, loaded once for the page and only where a form asks for it. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.addEventListener("load", () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("turnstile.missing"));
    });
    script.addEventListener("error", () => {
      loading = null;
      reject(new Error("turnstile.load"));
    });
    document.head.append(script);
  });
  return loading;
}

/**
 * Cloudflare Turnstile's check, rendered into the form. It hands its token
 * up as it is solved and takes it back when it expires; `generation` going
 * up asks for a fresh one, since a token works once. The server decides
 * whether the token is good; nothing here is trusted.
 */
export function TurnstileWidget({
  siteKey,
  action,
  locale,
  generation,
  onToken,
}: {
  siteKey: string;
  /** The form it guards, which the server checks the token was solved for. */
  action: "enquiry" | "sign_in" | "reset";
  locale: "en" | "ar";
  generation: number;
  onToken: (token: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const handOn = useRef(onToken);
  useEffect(() => {
    handOn.current = onToken;
  });
  useEffect(() => {
    let cancelled = false;
    void loadTurnstile()
      .then((api) => {
        if (cancelled || !container.current) return;
        widget.current =
          api.render(container.current, {
            sitekey: siteKey,
            action,
            language: locale,
            theme: "auto",
            size: "flexible",
            "response-field": false,
            callback: (token: string) => handOn.current(token),
            "expired-callback": () => handOn.current(""),
            "error-callback": () => handOn.current(""),
          }) ?? null;
      })
      .catch(() => handOn.current(""));
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey, action, locale]);
  useEffect(() => {
    if (generation > 0 && widget.current) {
      handOn.current("");
      window.turnstile?.reset(widget.current);
    }
  }, [generation]);
  return <div ref={container} className="min-h-[65px]" />;
}
