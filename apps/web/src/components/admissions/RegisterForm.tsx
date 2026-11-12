import type { ReactNode } from "react";

import { Button, buttonVariants } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { RadioGroup, RadioGroupItem } from "@faridalms/ui/radio-group";
import { useMutation } from "@tanstack/react-query";
import { Link, useHydrated } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { MailCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { TurnstileWidget } from "~/components/site/render/turnstile";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { registerFamily } from "~/server/admissions";
import { getMessageFromError } from "~/utils/error";

const ARABIC = /[؀-ۿ]/;

/** A name typed in either script, kept in the script it was typed in. */
function namesFrom(given: string, family: string) {
  const parts = { given: given.trim(), middle: "", family: family.trim() };
  const empty = { given: "", middle: "", family: "" };
  return ARABIC.test(`${given}${family}`)
    ? { ar: parts, en: empty }
    : { ar: empty, en: parts };
}

interface LabelledProps {
  id: string;
  label: string;
  error?: string | null;
  children: ReactNode;
}

function Labelled({ id, label, error, children }: LabelledProps) {
  return (
    <div className="grid gap-2" data-invalid={error ? true : undefined}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface RegisterFormProps {
  turnstileKey: string | null;
  /** The intake the person came to apply for, kept through to the form. */
  intake?: string;
  /** Whether the school takes applications filed for someone else. */
  forOthers: boolean;
}

/**
 * Someone registers to apply: who for, where the school takes applications
 * for others, then a name, an address to confirm and a phone. Whatever
 * happened, the page says to check the inbox, so it never tells a stranger
 * whether the address has an account.
 */
export function RegisterForm({
  turnstileKey,
  intake,
  forOthers,
}: RegisterFormProps) {
  const hydrated = useHydrated();
  const send = useServerFn(registerFamily);
  const opened = useRef(0);
  useEffect(() => {
    opened.current = Date.now();
  }, []);
  const [given, setGiven] = useState("");
  const [family, setFamily] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [token, setToken] = useState("");
  const [generation, setGeneration] = useState(0);
  const [tried, setTried] = useState(false);
  const [applyingFor, setApplyingFor] = useState<"" | "self" | "other">(
    forOthers ? "" : "self",
  );
  const locale = getLocale() === "ar" ? "ar" : "en";
  const register = useMutation({
    mutationFn: () =>
      send({
        data: {
          applyingFor: applyingFor || "self",
          names: namesFrom(given, family),
          email: email.trim(),
          phone: phone.trim(),
          locale,
          turnstile: token,
          website,
          elapsed: Date.now() - opened.current,
          intake,
        },
      }),
    onSettled: () => setGeneration((value) => value + 1),
  });
  const errors = {
    applyingFor: applyingFor ? null : m.registerErrWho(),
    given: given.trim() ? null : m.registerErrGiven(),
    family: family.trim() ? null : m.registerErrFamily(),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? null
      : m.registerErrEmail(),
  };
  const shown = (key: keyof typeof errors) => (tried ? errors[key] : null);

  if (register.isSuccess)
    return (
      <div aria-live="polite" className="grid justify-items-start gap-6">
        <span
          aria-hidden
          className="grid size-12 place-items-center rounded-full bg-primary/15 text-primary"
        >
          <MailCheck className="size-6" />
        </span>
        <div className="grid gap-2">
          <h2 className="text-2xl leading-8 font-semibold">
            {m.registerSentTitle()}
          </h2>
          <p className="text-muted-foreground">
            {m.registerSentBody({ email: email.trim() })}
          </p>
        </div>
        <Link to="/sign-in" className={buttonVariants({ variant: "outline" })}>
          {m.registerToSignIn()}
        </Link>
      </div>
    );

  return (
    <form
      noValidate
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if (Object.values(errors).some(Boolean)) return;
        register.mutate();
      }}
    >
      {forOthers ? (
        <fieldset
          className="grid gap-2"
          data-invalid={shown("applyingFor") ? true : undefined}
          aria-describedby={
            shown("applyingFor") ? "register-who-error" : undefined
          }
        >
          <legend className="mb-1 text-sm font-medium">
            {m.registerWho()}
          </legend>
          <RadioGroup
            value={applyingFor}
            onValueChange={(next) =>
              setApplyingFor(next === "other" ? "other" : "self")
            }
          >
            <label className="flex items-center gap-3 text-sm leading-5">
              <RadioGroupItem value="other" disabled={!hydrated} />
              {m.registerWhoOther()}
            </label>
            <label className="flex items-center gap-3 text-sm leading-5">
              <RadioGroupItem value="self" disabled={!hydrated} />
              {m.registerWhoSelf()}
            </label>
          </RadioGroup>
          {shown("applyingFor") ? (
            <p id="register-who-error" className="text-[13px] text-destructive">
              {shown("applyingFor")}
            </p>
          ) : null}
        </fieldset>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Labelled
          id="register-given"
          label={m.registerGiven()}
          error={shown("given")}
        >
          <Input
            id="register-given"
            dir="auto"
            autoComplete="given-name"
            disabled={!hydrated}
            value={given}
            aria-invalid={shown("given") ? true : undefined}
            onChange={(event) => setGiven(event.target.value)}
          />
        </Labelled>
        <Labelled
          id="register-family"
          label={m.registerFamily()}
          error={shown("family")}
        >
          <Input
            id="register-family"
            dir="auto"
            autoComplete="family-name"
            disabled={!hydrated}
            value={family}
            aria-invalid={shown("family") ? true : undefined}
            onChange={(event) => setFamily(event.target.value)}
          />
        </Labelled>
      </div>
      <Labelled
        id="register-email"
        label={m.registerEmail()}
        error={shown("email")}
      >
        <Input
          id="register-email"
          type="email"
          dir="ltr"
          autoComplete="email"
          disabled={!hydrated}
          value={email}
          aria-invalid={shown("email") ? true : undefined}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Labelled>
      <Labelled id="register-phone" label={m.registerPhone()}>
        <Input
          id="register-phone"
          type="tel"
          dir="ltr"
          autoComplete="tel"
          disabled={!hydrated}
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </Labelled>
      {/* Left empty by people; a script that fills every field gives itself away. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
        className="absolute -start-[9999px] size-px opacity-0"
        value={website}
        onChange={(event) => setWebsite(event.target.value)}
      />
      {turnstileKey ? (
        <TurnstileWidget
          siteKey={turnstileKey}
          action="register"
          locale={locale}
          generation={generation}
          onToken={setToken}
        />
      ) : null}
      {register.error ? (
        <p role="alert" className="text-sm text-destructive">
          {getMessageFromError(register.error)}
        </p>
      ) : null}
      <Button
        type="submit"
        className="w-full"
        disabled={
          !hydrated || register.isPending || (Boolean(turnstileKey) && !token)
        }
      >
        {register.isPending ? m.registerSending() : m.registerSubmit()}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {m.registerHaveAccount()}{" "}
        <Link
          to="/sign-in"
          className="text-primary underline-offset-4 hover:underline"
        >
          {m.registerToSignIn()}
        </Link>
      </p>
    </form>
  );
}
