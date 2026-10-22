import type { PanelLayout } from "@faridalms/domain/content";
import type { KeyboardEvent, ReactNode } from "react";

import { useEffect, useId, useRef, useState } from "react";

export interface PanelItem {
  key: string;
  title: ReactNode;
  body: ReactNode;
}

export interface PanelStrings {
  cardTurn: string;
  cardTurnBack: string;
}

/** The tab an arrow key moves to, Home and End going to either end. */
function nextTab(
  event: KeyboardEvent<HTMLElement>,
  index: number,
  count: number,
) {
  if (event.key === "Home") return 0;
  if (event.key === "End") return count - 1;
  const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
  const step =
    event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  if (step === 0) return null;
  return (index + (rtl ? -step : step) + count) % count;
}

function Tabs({ items }: { items: PanelItem[] }) {
  const [active, setActive] = useState(0);
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div className="fe-tabs">
      <div role="tablist" className="fe-tab-list">
        {items.map((item, index) => (
          <button
            key={item.key}
            ref={(element) => {
              tabs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-selected={index === active}
            aria-controls={`${id}-panel-${index}`}
            tabIndex={index === active ? 0 : -1}
            className="fe-tab"
            dir="auto"
            onClick={() => setActive(index)}
            onKeyDown={(event) => {
              const next = nextTab(event, index, items.length);
              if (next === null) return;
              event.preventDefault();
              setActive(next);
              tabs.current[next]?.focus();
            }}
          >
            {item.title}
          </button>
        ))}
      </div>
      {items.map((item, index) => (
        <div
          key={item.key}
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          hidden={index !== active}
          tabIndex={0}
          className="fe-tab-panel"
        >
          {item.body}
        </div>
      ))}
    </div>
  );
}

/**
 * A card a reader turns over: the front is one button, so what the back
 * holds (links, pictures, recordings) is never inside it, and turning moves
 * focus to the side that shows.
 */
function Card({ item, strings }: { item: PanelItem; strings: PanelStrings }) {
  const [turned, setTurned] = useState(false);
  const front = useRef<HTMLButtonElement>(null);
  const back = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    if (turned) back.current?.focus();
    else front.current?.focus();
  }, [turned]);
  const turn = (to: boolean) => {
    moved.current = true;
    setTurned(to);
  };
  return (
    <li className="fe-card" data-turned={turned}>
      <div className="fe-card-inner">
        <div className="fe-card-face fe-card-front" inert={turned}>
          <button
            ref={front}
            type="button"
            className="fe-card-turn"
            onClick={() => turn(true)}
          >
            <span className="fe-card-title" dir="auto">
              {item.title}
            </span>
            <span className="fe-card-hint">{strings.cardTurn}</span>
          </button>
        </div>
        <div
          ref={back}
          tabIndex={-1}
          className="fe-card-face fe-card-back"
          inert={!turned}
        >
          <div className="fe-card-body">{item.body}</div>
          <button
            type="button"
            className="fe-card-turn-back"
            onClick={() => turn(false)}
          >
            {strings.cardTurnBack}
          </button>
        </div>
      </div>
    </li>
  );
}

/**
 * A set of titled parts as its reader meets it. Tabs follow the WAI-ARIA
 * tabs pattern, arrow keys moving in the reading direction; steps and a
 * timeline are ordered lists; cards turn over. On paper every part shows,
 * a card's front above its back.
 */
export function PanelsView({
  layout,
  items,
  printed,
  strings,
}: {
  layout: PanelLayout;
  items: PanelItem[];
  printed: boolean;
  strings: PanelStrings;
}) {
  if (layout === "tabs" && !printed) return <Tabs items={items} />;
  if (layout === "cards" && !printed)
    return (
      <ul className="fe-cards">
        {items.map((item) => (
          <Card key={item.key} item={item} strings={strings} />
        ))}
      </ul>
    );
  return (
    <ol className="fe-steps" data-layout={layout}>
      {items.map((item) => (
        <li key={item.key} className="fe-step">
          <div className="fe-step-title" dir="auto">
            {item.title}
          </div>
          <div className="fe-step-body">{item.body}</div>
        </li>
      ))}
    </ol>
  );
}
