import type { RenderOptions, RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import { render } from "@testing-library/react";

import type { DesignSystemValue } from "./provider";

import { Toaster } from "../sonner";
import { ENGLISH } from "./english";
import { DesignSystemProvider } from "./provider";

export interface SystemRenderOptions extends RenderOptions {
  /** The language to render in; English unless a test needs another. */
  system?: DesignSystemValue;
}

/** Renders a component the way an app does: inside the design system, with toasts. */
export function renderWithSystem(
  component: ReactElement,
  { system = ENGLISH, ...options }: SystemRenderOptions = {},
): RenderResult {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <DesignSystemProvider value={system}>
        {children}
        <Toaster />
      </DesignSystemProvider>
    );
  }
  return render(component, { wrapper: Wrapper, ...options });
}
