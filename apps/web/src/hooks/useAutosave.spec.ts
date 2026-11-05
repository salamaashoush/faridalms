import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAutosave } from "./useAutosave";

const render = (save: (value: string) => Promise<void>) =>
  renderHook(({ value }) => useAutosave({ value, save, delay: 800 }), {
    initialProps: { value: "" },
  });

describe("useAutosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not say saved while a later change waits for its save", async () => {
    const save = vi.fn(async (_value: string) => {});
    const { result, rerender } = render(save);

    rerender({ value: "first" });
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(result.current.state).toBe("saved");

    rerender({ value: "first and more" });
    expect(result.current.state).toBe("saving");
    expect(result.current.dirty).toBe(true);

    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(save).toHaveBeenLastCalledWith("first and more");
    expect(result.current.state).toBe("saved");
  });

  it("saves nothing for a change undone before its save ran", async () => {
    const save = vi.fn(async (_value: string) => {});
    const { result, rerender } = render(save);

    rerender({ value: "first" });
    await act(() => vi.advanceTimersByTimeAsync(800));
    rerender({ value: "first, oops" });
    rerender({ value: "first" });
    await act(() => vi.advanceTimersByTimeAsync(800));

    expect(save.mock.calls).toEqual([["first"]]);
    expect(result.current.state).toBe("saved");
    expect(result.current.dirty).toBe(false);
  });

  it("saves a value changed back while an earlier save was under way", async () => {
    const landings: Array<() => void> = [];
    const land = () => landings.shift()?.();
    const save = vi.fn(
      (_value: string) =>
        new Promise<void>((resolve) => {
          landings.push(resolve);
        }),
    );
    const { result, rerender } = render(save);

    rerender({ value: "first" });
    await act(() => vi.advanceTimersByTimeAsync(800));
    land();
    await act(() => vi.advanceTimersByTimeAsync(0));
    rerender({ value: "second" });
    await act(() => vi.advanceTimersByTimeAsync(800));
    rerender({ value: "first" });
    land();
    await act(() => vi.advanceTimersByTimeAsync(0));
    land();
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(save.mock.calls).toEqual([["first"], ["second"], ["first"]]);
    expect(result.current.dirty).toBe(false);
  });
});
