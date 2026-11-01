import type { FormEvent, ReactNode } from "react";

import { DEMO_ROLES, DEMO_SIZES } from "@faridalms/domain/product";
import { Button } from "@faridalms/ui/button";
import { Input } from "@faridalms/ui/input";
import { Label } from "@faridalms/ui/label";
import { Textarea } from "@faridalms/ui/textarea";
import { useHydrated } from "@tanstack/react-router";
import { CircleAlert, CircleCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { requestDemo } from "~/server/product";

type State = "idle" | "sending" | "sent" | "failed" | "limited" | "unavailable";

const ROLE_LABEL = {
  leader: m.productRoleLeader,
  teacher: m.productRoleTeacher,
  it: m.productRoleIt,
  parent: m.productRoleParent,
  other: m.productRoleOther,
} satisfies Record<(typeof DEMO_ROLES)[number], () => string>;

const SIZE_LABEL = {
  under_200: m.productSizeUnder200,
  "200_1000": m.productSize200To1000,
  over_1000: m.productSizeOver1000,
} satisfies Record<(typeof DEMO_SIZES)[number], () => string>;

const SELECT =
  "h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

function Field({
  id,
  label,
  optional,
  children,
}: {
  id: string;
  label: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>
        {label}
        {optional ? (
          <span className="font-normal text-muted-foreground">
            {" "}
            {m.productOptional()}
          </span>
        ) : null}
      </Label>
      {children}
    </div>
  );
}

/**
 * The demonstration request. Inputs are uncontrolled so what someone typed
 * before the page hydrated is kept, and sending waits for hydration so the
 * form never posts natively.
 */
export function DemoForm() {
  const [state, setState] = useState<State>("idle");
  const opened = useRef(0);
  const hydrated = useHydrated();
  useEffect(() => {
    opened.current = Date.now();
  }, []);

  const send = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!hydrated || state === "sending") return;
    const form = new FormData(event.currentTarget);
    const read = (key: string) => {
      const value = form.get(key);
      return typeof value === "string" ? value : "";
    };
    const size = read("size");
    setState("sending");
    try {
      await requestDemo({
        data: {
          locale: getLocale() === "ar" ? "ar" : "en",
          name: read("name"),
          email: read("email"),
          school: read("school"),
          role: read("role") as (typeof DEMO_ROLES)[number],
          size: size ? (size as (typeof DEMO_SIZES)[number]) : undefined,
          phone: read("phone"),
          message: read("message"),
          website: read("website"),
          elapsed: Date.now() - opened.current,
        },
      });
      setState("sent");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setState(
        message === "product.too_many"
          ? "limited"
          : message === "product.unavailable"
            ? "unavailable"
            : "failed",
      );
    }
  };

  if (state === "sent")
    return (
      <output className="grid min-h-96 content-center justify-items-start gap-5 rounded-2xl border bg-card p-8 shadow-xl shadow-black/5 sm:p-10 dark:shadow-black/30">
        <span className="grid size-12 place-items-center rounded-full bg-[#dcedcf] text-[#153f3a]">
          <CircleCheck aria-hidden className="size-6" />
        </span>
        <p className="max-w-sm text-xl leading-snug font-semibold text-balance">
          {m.productDemoSent()}
        </p>
      </output>
    );

  const problem =
    state === "failed"
      ? m.productDemoFailed()
      : state === "limited"
        ? m.productDemoLimited()
        : state === "unavailable"
          ? m.productDemoUnavailable()
          : null;

  return (
    <form
      onSubmit={(event) => void send(event)}
      className="grid gap-6 rounded-2xl border bg-card p-5 shadow-xl shadow-black/5 sm:p-8 dark:shadow-black/30"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="demo-name" label={m.productDemoName()}>
          <Input
            id="demo-name"
            name="name"
            required
            maxLength={120}
            autoComplete="name"
            dir="auto"
          />
        </Field>
        <Field id="demo-email" label={m.productDemoEmail()}>
          <Input
            id="demo-email"
            name="email"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            dir="ltr"
          />
        </Field>
      </div>
      <Field id="demo-school" label={m.productDemoSchool()}>
        <Input
          id="demo-school"
          name="school"
          required
          maxLength={160}
          autoComplete="organization"
          dir="auto"
        />
      </Field>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="demo-role" label={m.productDemoRole()}>
          <select
            id="demo-role"
            name="role"
            required
            defaultValue=""
            className={SELECT}
          >
            <option value="" disabled>
              {m.productDemoChoose()}
            </option>
            {DEMO_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]()}
              </option>
            ))}
          </select>
        </Field>
        <Field id="demo-size" label={m.productDemoSize()} optional>
          <select id="demo-size" name="size" defaultValue="" className={SELECT}>
            <option value="">{m.productDemoChoose()}</option>
            {DEMO_SIZES.map((size) => (
              <option key={size} value={size}>
                {SIZE_LABEL[size]()}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="demo-phone" label={m.productDemoPhone()} optional>
        <Input
          id="demo-phone"
          name="phone"
          type="tel"
          maxLength={40}
          autoComplete="tel"
          dir="ltr"
        />
      </Field>
      <Field id="demo-message" label={m.productDemoMessage()} optional>
        <Textarea
          id="demo-message"
          name="message"
          maxLength={2000}
          rows={4}
          dir="auto"
        />
      </Field>
      {/* Hidden from people; a script that fills it is answered unheard. */}
      <div
        aria-hidden
        className="absolute -start-[9999px] size-px overflow-hidden"
      >
        <label htmlFor="demo-website">Website</label>
        <input
          id="demo-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>
      {problem ? (
        <p
          role="alert"
          className="flex items-center gap-2 text-sm text-destructive"
        >
          <CircleAlert aria-hidden className="size-4 shrink-0" />
          {problem}
        </p>
      ) : null}
      <Button
        type="submit"
        size="lg"
        className="w-full px-5 sm:w-auto sm:justify-self-start"
        disabled={state === "sending"}
      >
        {state === "sending" ? m.productDemoSending() : m.productDemoSend()}
      </Button>
    </form>
  );
}
