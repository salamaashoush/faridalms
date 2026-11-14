import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NearViewport } from "./near-viewport";
import { renderWithSystem } from "./testing";

let tell: ((near: boolean) => void) | null = null;
let watched: { rootMargin?: string } | undefined;

class FakeObserver {
  constructor(
    callback: (entries: { isIntersecting: boolean }[]) => void,
    options?: { rootMargin?: string },
  ) {
    watched = options;
    tell = (near) => callback([{ isIntersecting: near }]);
  }
  observe() {}
  disconnect() {
    tell = null;
  }
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", FakeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
  tell = null;
});

describe("NearViewport", () => {
  it("draws nothing until the box comes near the screen, keeping its size", () => {
    renderWithSystem(
      <NearViewport style={{ height: 224 }}>
        <p>Drawn</p>
      </NearViewport>,
    );
    expect(screen.queryByText("Drawn")).toBeNull();
    expect(watched?.rootMargin).toBe("400px");
    act(() => tell?.(true));
    const drawn = screen.getByText("Drawn");
    expect(drawn.parentElement).toHaveStyle({ height: "224px" });
  });

  it("lets its content go once the box is far away again", () => {
    renderWithSystem(
      <NearViewport margin="100px">
        <p>Drawn</p>
      </NearViewport>,
    );
    expect(watched?.rootMargin).toBe("100px");
    act(() => tell?.(true));
    expect(screen.getByText("Drawn")).toBeInTheDocument();
    act(() => tell?.(false));
    expect(screen.queryByText("Drawn")).toBeNull();
  });
});
