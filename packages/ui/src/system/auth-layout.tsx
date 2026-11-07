import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../cn";

/** One thing the product does, as the band beside a sign-in form lists it. */
export interface AuthFeature {
  icon: LucideIcon;
  title: string;
  body: string;
}

/** What the band beside a sign-in form says. */
export interface AuthBandContent {
  eyebrow: string;
  heading: string;
  body: string;
  features: readonly AuthFeature[];
  /** A way out at the band's foot, such as the school's website. */
  link?: ReactNode;
}

export interface AuthBandProps extends AuthBandContent {
  mark: ReactNode;
}

/**
 * The brand's side of a page before sign-in: its mark, what the product is
 * for, and a few things it does, on the brand's own colour. Wide screens only.
 */
export function AuthBand({
  mark,
  eyebrow,
  heading,
  body,
  features,
  link,
}: AuthBandProps) {
  return (
    <aside className="relative hidden overflow-hidden bg-brand p-12 text-brand-foreground lg:flex lg:flex-col xl:p-16">
      <div className="text-lg">{mark}</div>
      <div className="relative z-10 my-auto max-w-lg py-16">
        <p className="mb-5 text-xs font-medium tracking-[0.2em] uppercase opacity-75 rtl:tracking-normal">
          {eyebrow}
        </p>
        <p className="text-5xl leading-[1.15] font-medium tracking-tight xl:text-6xl">
          {heading}
        </p>
        <p className="mt-6 max-w-md text-base leading-relaxed opacity-80">
          {body}
        </p>
        <ul className="mt-12 space-y-7">
          {features.map(({ icon: Icon, title, body: detail }) => (
            <li key={title} className="flex gap-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-current/15 bg-current/5">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="mt-1 text-sm opacity-75">{detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
      {link ? <div className="relative z-10 self-start">{link}</div> : null}
      <div
        className="pointer-events-none absolute -end-40 -bottom-56 size-[520px] rounded-full border-[80px] border-current/[0.05]"
        aria-hidden
      />
    </aside>
  );
}

export interface AuthLayoutProps extends Omit<ComponentProps<"div">, "children"> {
  /** The brand's mark: in the band on wide screens, over the form otherwise. */
  mark: ReactNode;
  /** The band beside the form; a long flow leaves it out. */
  band?: AuthBandContent | null;
  /** Small controls at the top end, such as language and theme. */
  tools?: ReactNode;
  footer?: ReactNode;
  /** A long flow, such as an application, takes the page's whole width. */
  wide?: boolean;
  children: ReactNode;
}

/**
 * Every page before sign-in: a band in the brand's colour beside a narrow
 * column holding the form, or, for a long flow, the whole width under a
 * slim header. Root props, such as a school's colours, go on the frame.
 */
export function AuthLayout({
  mark,
  band = null,
  tools,
  footer,
  wide = false,
  className,
  children,
  ...frame
}: AuthLayoutProps) {
  const banded = band !== null && !wide;
  return (
    <div
      {...frame}
      className={cn(
        "grid min-h-dvh",
        banded && "lg:grid-cols-[1fr_1.05fr]",
        className,
      )}
    >
      {banded ? <AuthBand mark={mark} {...band} /> : null}
      <div className="flex min-h-dvh flex-col">
        <div
          className={cn(
            "flex items-center justify-between gap-4 p-5 sm:p-8",
            wide && "border-b",
          )}
        >
          <span className={cn("min-w-0 text-primary", banded && "lg:invisible")}>
            {mark}
          </span>
          {tools ? <div className="flex shrink-0 gap-1">{tools}</div> : null}
        </div>
        <main
          id="main"
          className={cn(
            "flex flex-1 justify-center px-6 py-12 sm:px-12",
            wide ? "items-start" : "items-center",
          )}
        >
          <div className={cn("w-full", wide ? "max-w-3xl" : "max-w-[400px]")}>
            {children}
          </div>
        </main>
        {footer}
      </div>
    </div>
  );
}

export interface AuthHeadingProps {
  title: string;
  lead?: string;
}

/** A heading and a sentence over a page's form, before sign-in. */
export function AuthHeading({ title, lead }: AuthHeadingProps) {
  return (
    <div className="mb-8 grid gap-2">
      <h1
        dir="auto"
        className="text-[32px] leading-10 font-semibold tracking-tight text-foreground"
      >
        {title}
      </h1>
      {lead ? <p className="text-muted-foreground">{lead}</p> : null}
    </div>
  );
}
