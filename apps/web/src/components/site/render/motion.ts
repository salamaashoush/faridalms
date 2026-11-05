import type { Motion } from "@faridalms/domain/site-theme";
import type { RefObject } from "react";

import { useEffect, useRef } from "react";

/** Past this many items a list stops waiting longer, so the last never lags behind the reader. */
const MAX_STAGGER = 6;

const lessMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const onScreen = (element: Element) => {
  const box = element.getBoundingClientRect();
  return box.top < window.innerHeight && box.bottom > 0;
};

/**
 * Sections marked `data-reveal` rise into view as they scroll in, their
 * `data-stagger` lists one item after another. What is on screen when the
 * page opens is shown at once, so nothing the server drew blinks out, and
 * sections a later page brings into the same frame are picked up the same
 * way. Anyone who asks for less motion gets the fade alone, from the
 * stylesheet.
 */
export function useReveal(root: RefObject<HTMLElement | null>, motion: Motion) {
  useEffect(() => {
    const element = root.current;
    if (!element || motion === "none") return undefined;
    const fadeOnly = lessMotion();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-shown", "");
            // The app's stylesheet stops every transition for less motion,
            // so the one movement kept, a short fade, is played here.
            if (fadeOnly)
              entry.target.animate([{ opacity: 0 }, { opacity: 1 }], {
                duration: 400,
                easing: "ease-out",
              });
            observer.unobserve(entry.target);
          }
      },
      // Any part entering counts: a tall section on a phone may never show
      // a fixed share of itself.
      { rootMargin: "0px 0px -10% 0px", threshold: 0 },
    );
    // Whatever moves on its own (a strip of logos, a ticker of words) stops
    // while it is off screen, so it costs nothing nobody is watching.
    const moving = new IntersectionObserver((entries) => {
      for (const entry of entries)
        entry.target.toggleAttribute("data-offscreen", !entry.isIntersecting);
    });
    const seen = new WeakSet<Element>();
    const adopt = () => {
      for (const strip of element.querySelectorAll(".site-marquee"))
        if (!seen.has(strip)) {
          seen.add(strip);
          moving.observe(strip);
        }
      for (const target of element.querySelectorAll<HTMLElement>(
        "[data-reveal]",
      )) {
        if (seen.has(target)) continue;
        seen.add(target);
        for (const list of target.querySelectorAll<HTMLElement>(
          "[data-stagger]",
        ))
          [...list.children].forEach((child, index) => {
            (child as HTMLElement).style.setProperty(
              "--s-index",
              String(Math.min(index, MAX_STAGGER)),
            );
          });
        if (onScreen(target)) target.setAttribute("data-shown", "");
        else observer.observe(target);
      }
    };
    adopt();
    element.setAttribute("data-motion-ready", "");
    const changes = new MutationObserver((records) => {
      if (
        records.some((record) =>
          [...record.addedNodes].some((node) => node instanceof Element),
        )
      )
        adopt();
    });
    changes.observe(element, { childList: true, subtree: true });
    return () => {
      changes.disconnect();
      observer.disconnect();
      moving.disconnect();
      element.removeAttribute("data-motion-ready");
    };
  }, [root, motion]);
}

const NUMBER = /^(\D*?)(\d[\d,.]*)(.*)$/;
const COUNT_MS = 1600;

/**
 * A figure that counts up from zero the first time it scrolls into view,
 * keeping its own separators and suffix ("1,200", "98%"); a ratio such as
 * "12:1" stays put. A figure already on screen when the page opens is left
 * as it is, since counting it would take away a number someone is reading.
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
      lessMotion() ||
      onScreen(element)
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
    const settle = () => {
      element.textContent = value;
      element.removeAttribute("data-counting");
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        element.setAttribute("data-counting", "");
        element.textContent = format(0);
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / COUNT_MS);
          const eased = 1 - (1 - progress) ** 4;
          element.textContent = format(target * eased);
          if (progress < 1) frame = requestAnimationFrame(tick);
          else settle();
        };
        frame = requestAnimationFrame(tick);
      },
      // From the first pixel in, so it drops to zero at the edge of the
      // screen rather than under the reader's eye.
      { threshold: 0 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      settle();
    };
  }, [value, enabled]);
  return ref;
}
