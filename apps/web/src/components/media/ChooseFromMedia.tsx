import type {
  SchoolMedia,
  MediaChoice,
  MediaChoiceKind,
} from "@faridalms/editor";

import { Button } from "@faridalms/ui/button";
import { Images } from "lucide-react";

import * as m from "~/i18n/messages";

export interface ChooseFromMediaProps {
  /** The school's media, where the writer may choose from it; nothing shows otherwise. */
  media: SchoolMedia | undefined;
  kind: MediaChoiceKind;
  onChoose: (chosen: MediaChoice) => void;
  size?: "sm" | "default";
}

/** A field's way into the school's media, beside its upload. */
export function ChooseFromMedia({
  media,
  kind,
  onChoose,
  size = "sm",
}: ChooseFromMediaProps) {
  if (!media) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className="max-md:h-10"
      onClick={() => {
        media.choose(kind).then(
          (chosen) => {
            const [first] = chosen ?? [];
            if (first) onChoose(first);
          },
          () => undefined,
        );
      }}
    >
      <Images aria-hidden />
      {m.editorMediaChoose()}
    </Button>
  );
}
