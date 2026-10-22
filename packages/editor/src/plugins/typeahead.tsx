import type { MenuOption } from "@lexical/react/LexicalTypeaheadMenuPlugin";
import type { ReactNode } from "react";

import { cx } from "../ui";

/**
 * One choice in a menu typed for at the caret. The menu is a listbox the
 * text drives through aria-activedescendant, so focus and the arrow keys
 * stay in the text while a choice is highlighted.
 */
export function TypeaheadItem({
  option,
  index,
  selected,
  onHighlight,
  onSelect,
  className,
  children,
}: {
  option: MenuOption;
  index: number;
  selected: boolean;
  onHighlight: (index: number) => void;
  onSelect: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      ref={(element) => option.setRefElement(element)}
      role="option"
      tabIndex={-1}
      aria-selected={selected}
      id={`typeahead-item-${index}`}
      onMouseEnter={() => onHighlight(index)}
      onClick={() => {
        onHighlight(index);
        onSelect();
      }}
      className={cx(
        "flex cursor-pointer items-center rounded-md px-2 py-1.5",
        selected && "bg-accent",
        className,
      )}
    >
      {children}
    </div>
  );
}
