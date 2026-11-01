import type { ReactNode } from "react";

import { cn } from "@faridalms/ui/cn";
import { BookOpen, GraduationCap, Languages, Users } from "lucide-react";

import type { PortalFace } from "~/queries/portal";

import { LocaleToggle } from "~/components/theme/LocaleToggle";
import { ThemeToggle } from "~/components/theme/ThemeToggle";
import * as m from "~/i18n/messages";

import {
  faceAccent,
  PlatformFooter,
  SchoolMark,
  SchoolPanel,
} from "./SchoolFace";

function Toggles() {
  return (
    <div className="flex shrink-0 gap-1">
      <LocaleToggle />
      <ThemeToggle />
    </div>
  );
}

/**
 * A school's own sign-in pages: its side, in its website's theme, beside
 * the form on wide screens and under it on phones, where the form comes
 * first; the form in the app's own light or dark, accented in the school's
 * colour.
 */
function SchoolLayout({
  face,
  children,
}: {
  face: PortalFace;
  children: ReactNode;
}) {
  const accent = faceAccent(face);
  return (
    <div
      {...accent}
      className={cn(
        accent.className,
        "grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]",
      )}
    >
      <SchoolPanel face={face} className="max-lg:order-2" />
      <div className="flex flex-col max-lg:order-1 lg:min-h-dvh">
        <div className="flex items-center justify-between gap-3 p-5 sm:p-8">
          <SchoolMark face={face} className="lg:invisible" />
          <Toggles />
        </div>
        <main className="flex flex-1 items-center justify-center px-6 pt-4 pb-12 sm:px-12">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>
        <PlatformFooter className="max-lg:hidden" />
      </div>
      <PlatformFooter className="order-3 lg:hidden" />
    </div>
  );
}

/** The bare portal domain, where no school is named yet: the platform's own page. */
function PlatformLayout({ children }: { children: ReactNode }) {
  const features = [
    {
      icon: BookOpen,
      title: m.authFeatureLearning(),
      body: m.authFeatureLearningBody(),
    },
    {
      icon: Users,
      title: m.authFeatureCommunity(),
      body: m.authFeatureCommunityBody(),
    },
    {
      icon: Languages,
      title: m.authFeatureLanguage(),
      body: m.authFeatureLanguageBody(),
    },
  ];
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="school-sidebar relative hidden overflow-hidden p-12 lg:flex lg:flex-col xl:p-16">
        <div className="flex items-center gap-3 text-lg font-semibold">
          <GraduationCap className="size-8" aria-hidden />
          {m.appName()}
        </div>
        <div className="relative z-10 my-auto max-w-lg py-16">
          <p className="mb-5 text-xs font-medium tracking-[0.2em] text-[#c7d9b8] uppercase">
            {m.workspaceLabel()}
          </p>
          <h2 className="text-5xl leading-[1.15] font-medium tracking-tight xl:text-6xl">
            {m.authBrandHeading()}
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-[#bcd2c8]">
            {m.authBrandBody()}
          </p>
          <div className="mt-12 space-y-7">
            {features.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/5">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-sm font-medium">{title}</h3>
                  <p className="mt-1 text-sm text-[#bcd2c8]">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div
          className="pointer-events-none absolute -end-40 -bottom-56 size-[520px] rounded-full border-[80px] border-white/[0.03]"
          aria-hidden
        />
      </div>
      <div className="flex min-h-screen flex-col">
        <div className="flex items-center justify-between p-5 sm:p-8">
          <span className="flex items-center gap-2 font-semibold text-primary lg:invisible">
            <GraduationCap className="size-6" aria-hidden />
            {m.appName()}
          </span>
          <Toggles />
        </div>
        <main className="flex flex-1 items-center justify-center px-6 py-12 sm:px-12">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>
        <PlatformFooter />
      </div>
    </div>
  );
}

/**
 * The frame of every page before sign-in: the school's own where the page
 * knows the school, the platform's on the bare domain.
 */
export function AuthLayout({
  face = null,
  children,
}: {
  face?: PortalFace | null;
  children: ReactNode;
}) {
  return face ? (
    <SchoolLayout face={face}>{children}</SchoolLayout>
  ) : (
    <PlatformLayout>{children}</PlatformLayout>
  );
}
