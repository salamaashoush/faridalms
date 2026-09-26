import type { ReactNode } from "react";

import { useHydrated } from "@tanstack/react-router";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { UnsavedChangesGuard } from "~/components/app/UnsavedChangesGuard";
import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";

interface Unsaved {
  isDirty: () => boolean;
  pending: boolean;
}

type Register = (id: string, unsaved: Unsaved | null) => void;

const UnsavedContext = createContext<Register | null>(null);

/**
 * The page guards unsaved edits once for all of its sections, so leaving with
 * two cards changed asks once rather than once per card.
 */
export function SettingsPage({ children }: { children: ReactNode }) {
  const [sections, setSections] = useState<ReadonlyMap<string, Unsaved>>(
    () => new Map(),
  );
  const register = useCallback<Register>(
    (id, unsaved) =>
      setSections((previous) => {
        const next = new Map(previous);
        if (unsaved) next.set(id, unsaved);
        else next.delete(id);
        return next;
      }),
    [],
  );
  const all = [...sections.values()];
  return (
    <UnsavedContext.Provider value={register}>
      <div className="@container/settings grid w-full max-w-[960px] gap-10">
        {children}
      </div>
      <UnsavedChangesGuard
        isDirty={() => all.some((section) => section.isDirty())}
        pending={all.some((section) => section.pending)}
      />
    </UnsavedContext.Provider>
  );
}

function useUnsaved(isDirty: (() => boolean) | undefined, pending: boolean) {
  const register = useContext(UnsavedContext);
  const id = useId();
  const latest = useRef(isDirty);
  useEffect(() => {
    latest.current = isDirty;
  });
  const watched = Boolean(isDirty);
  useEffect(() => {
    if (!register || !watched) return undefined;
    register(id, { isDirty: () => latest.current?.() ?? false, pending });
    return () => register(id, null);
  }, [register, id, watched, pending]);
  return register !== null;
}

/**
 * One group of settings: what it is on the start side, the fields in a card
 * on the end side, stacked while the settings page is narrower than 800px.
 * A section with `onSubmit` is its own form with Save at the start of the
 * card's footer, so saving one never sends another's half-finished edits.
 * Without it the card only shows, and `footer` can hold a way to where it is
 * changed.
 */
export function SettingsSection({
  title,
  description,
  onSubmit,
  pending = false,
  error,
  saved = false,
  isDirty,
  submitLabel = m.commonSave(),
  footer,
  children,
}: {
  title: string;
  description?: ReactNode;
  onSubmit?: () => void | Promise<unknown>;
  pending?: boolean;
  error?: string | null;
  saved?: boolean;
  isDirty?: () => boolean;
  submitLabel?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  const hydrated = useHydrated();
  const guarded = useUnsaved(isDirty, pending);
  const body = (
    <div className="@container grid min-w-0 gap-6 p-5">
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm leading-5 text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      {children}
    </div>
  );
  const card = "min-w-0 rounded-lg border bg-card text-card-foreground";
  const footerRow = "flex flex-wrap items-center gap-3 border-t px-5 py-4";
  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-4 @min-[800px]/settings:grid-cols-[280px_minmax(0,1fr)] @min-[800px]/settings:gap-8"
    >
      <div className="min-w-0">
        <h2 id={headingId} className="text-base leading-6 font-semibold">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-[13px] leading-[18px] text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {onSubmit ? (
        <form
          noValidate
          aria-labelledby={headingId}
          className={card}
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            void Promise.resolve(onSubmit()).then(() => {
              requestAnimationFrame(() => {
                form
                  .querySelector<HTMLElement>('[aria-invalid="true"]')
                  ?.focus();
              });
            });
          }}
        >
          <fieldset disabled={!hydrated || pending} className="min-w-0">
            {body}
          </fieldset>
          <div className={footerRow}>
            <Button
              type="submit"
              className="max-md:h-10"
              disabled={!hydrated || pending}
            >
              {pending ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : null}
              {submitLabel}
            </Button>
            {footer}
            <span
              aria-live="polite"
              className="inline-flex items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground"
            >
              {saved ? (
                <>
                  <Check className="size-3.5 text-success" aria-hidden />
                  {m.docSaved()}
                </>
              ) : null}
            </span>
          </div>
          {isDirty && !guarded ? (
            <UnsavedChangesGuard isDirty={isDirty} pending={pending} />
          ) : null}
        </form>
      ) : (
        <div className={card}>
          {body}
          {footer ? <div className={footerRow}>{footer}</div> : null}
        </div>
      )}
    </section>
  );
}
