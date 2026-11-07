import type {
  EditorLibrary,
  LibraryChoice,
  LibraryKind,
} from "@faridalms/editor";

import { Button } from "@faridalms/ui/button";
import { Images } from "lucide-react";

import * as m from "~/i18n/messages";

export interface ChooseFromLibraryProps {
  /** The library, where the writer may choose from it; nothing shows otherwise. */
  library: EditorLibrary | undefined;
  kind: LibraryKind;
  onChoose: (chosen: LibraryChoice) => void;
  size?: "sm" | "default";
}

/** A field's way into the school's media library, beside its upload. */
export function ChooseFromLibrary({
  library,
  kind,
  onChoose,
  size = "sm",
}: ChooseFromLibraryProps) {
  if (!library) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className="max-md:h-10"
      onClick={() => {
        library.choose(kind).then(
          (chosen) => {
            const [first] = chosen ?? [];
            if (first) onChoose(first);
          },
          () => undefined,
        );
      }}
    >
      <Images aria-hidden />
      {m.editorLibraryChoose()}
    </Button>
  );
}
