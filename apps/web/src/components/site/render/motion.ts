import type { Motion } from "@faridalms/domain/site-theme";
import type { RefObject } from "react";

import { useEffect, useRef } from "react";

const MAX_STAGGER = 8;

/**
 * Sections marked `data-reveal` rise into view as they scroll in, their
 * `data-stagger` lists one item after another. What is on screen when the
 * page opens is shown at once, so nothing the server drew blinks out.
 */
export function useReveal(root: RefObject<HTMLElement | null>, motion: Motion) {
  useEffect(() => {
    const element = root.current;
    if (
      !element ||
      motion === "none" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return undefined;
    const targets = [...element.querySelectorAll<HTMLElement>("[data-reveal]")];
    for (const target of targets) {
      for (const list of target.querySelectorAll<HTMLElement>("[data-stagger]"))
        [...list.children].forEach((child, index) => {
          (child as HTMLElement).style.setProperty(
            "--s-index",
            String(Math.min(index, MAX_STAGGER)),
          );
        });
      const box = target.getBoundingClientRect();
      if (box.top < window.innerHeight && box.bottom > 0)
        target.setAttribute("data-shown", "");
    }
    element.setAttribute("data-motion-ready", "");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-shown", "");
            observer.unobserve(entry.target);
          }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    for (const target of targets)
      if (!target.hasAttribute("data-shown")) observer.observe(target);
    return () => {
      observer.disconnect();
      element.removeAttribute("data-motion-ready");
    };
  }, [root, motion]);
}

const NUMBER = /^(\D*?)(\d[\d,.]*)(.*)$/;

/**
 * A figure that counts up from zero the first time it scrolls into view,
 * keeping its own separators and suffix ("1,200", "98%", "12:1" stays put).
 */
export function useCountUp(value: string, enabled: boolean) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    const match = NUMBER.exec(value);
    if (
      !element ||
      !enabled ||
      !match ||
      value.includes(":") ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return undefined;
    const [, before = "", digits = "", after = ""] = match;
    const target = Number(digits.replaceAll(",", ""));
    if (!Number.isFinite(target) || target === 0) return undefined;
    const decimals = digits.includes(".")
      ? (digits.split(".")[1]?.length ?? 0)
      : 0;
    const grouped = digits.includes(",");
    const format = (amount: number) => {
      const fixed = amount.toFixed(decimals);
      return `${before}${grouped ? Number(fixed).toLocaleString("en", { minimumFractionDigits: decimals }) : fixed}${after}`;
    };
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / 1400);
          const eased = 1 - (1 - progress) ** 3;
          element.textContent = format(target * eased);
          if (progress < 1) frame = requestAnimationFrame(tick);
          else element.textContent = value;
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      element.textContent = value;
    };
  }, [value, enabled]);
  return ref;
}
