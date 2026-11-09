import type { ReactNode } from "react";

import { Button } from "../button";
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

import { EmptyStateScope } from "./empty-state";
import { mayMoveFocus } from "./focus-after-submit";
import { Page } from "./page";
import { useSystemStrings } from "./provider";
import { UnsavedChangesGuard } from "./unsaved-changes-guard";

interface Unsaved {
  isDirty: () => boolean;
  pending: boolean;
}

type Register = (id: string, unsaved: Unsaved | null) => void;

const UnsavedContext = createContext<Register | null>(null);

export interface SettingsPageProps {
  children: ReactNode;
}

/**
 * Settings read at the form width, as a page of their own or as a tab of a
 * wider page. The page guards unsaved edits once for all of its sections, so
 * leaving with two cards changed asks once rather than once per card.
 */
export function SettingsPage({ children }: SettingsPageProps) {
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
      <Page width="form">
        <div className="grid gap-6">{children}</div>
      </Page>
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

export interface SettingsSectionProps {
  title: string;
  description?: ReactNode;
  /** Makes the card its own form, saved on its own. */
  onSubmit?: () => void | Promise<unknown>;
  pending?: boolean;
  error?: string | null;
  /** The last save went through; says so beside Save. */
  saved?: boolean;
  isDirty?: () => boolean;
  submitLabel?: string;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * One group of settings as a card: its title and description, then the
 * fields. A section with `onSubmit` is its own form with Save at the start of
 * the card's footer, so saving one never sends another's half-finished edits.
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
  submitLabel,
  footer,
  children,
}: SettingsSectionProps) {
  const strings = useSystemStrings();
  const headingId = useId();
  const hydrated = useHydrated();
  const guarded = useUnsaved(isDirty, pending);
  const body = (
    <div className="@container grid min-w-0 gap-6 px-5 pt-5 pb-6">
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2.5 text-sm leading-5 text-destructive"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}
      <EmptyStateScope>{children}</EmptyStateScope>
    </div>
  );
  const footerRow = "flex flex-wrap items-center gap-3 border-t px-5 py-4";
  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0 rounded-lg border bg-card text-card-foreground"
    >
      <div className="border-b px-5 py-4">
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
          className="min-w-0"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const before = form.ownerDocument.activeElement;
            void Promise.resolve(onSubmit()).then(() => {
              requestAnimationFrame(() => {
                if (!mayMoveFocus(before, form.ownerDocument)) return;
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
              {submitLabel ?? strings.save}
            </Button>
            {footer}
            <span
              aria-live="polite"
              className="inline-flex items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground"
            >
              {saved ? (
                <>
                  <Check className="size-3.5 text-success" aria-hidden />
                  {strings.saved}
                </>
              ) : null}
            </span>
          </div>
          {isDirty && !guarded ? (
            <UnsavedChangesGuard isDirty={isDirty} pending={pending} />
          ) : null}
        </form>
      ) : (
        <>
          {body}
          {footer ? <div className={footerRow}>{footer}</div> : null}
        </>
      )}
    </section>
  );
}

export interface SettingsGroupProps {
  title: string;
  children: ReactNode;
}

/** Related fields inside a settings card, under a small heading of their own. */
export function SettingsGroup({ title, children }: SettingsGroupProps) {
  return (
    <div className="border-t pt-6 first:border-t-0 first:pt-0">
      <fieldset className="grid min-w-0 gap-6">
        <legend className="mb-5 text-sm leading-5 font-semibold">
          {title}
        </legend>
        {children}
      </fieldset>
    </div>
  );
}
