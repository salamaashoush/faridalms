import type { EditorPuzzles } from "@faridalms/editor";
import type { Level } from "@faridalms/puzzles/level";
import type { ReactNode } from "react";

import { Suspense, lazy, useMemo, useState } from "react";

import { designerStrings, editorSetting } from "~/components/puzzles/strings";

const Designer = lazy(() =>
  import("@faridalms/puzzles/Designer").then((module) => ({
    default: module.Designer,
  })),
);

/**
 * The puzzle designer an editor opens on a puzzle question, where the
 * document may ask questions at all and the school has coding. The designer is fetched when a
 * teacher first opens it.
 */
export function useEditorPuzzles(questions: boolean): {
  puzzles: EditorPuzzles | undefined;
  dialog: ReactNode;
} {
  const [open, setOpen] = useState<{
    level: Level;
    resolve: (level: Level | undefined) => void;
  } | null>(null);
  const puzzles = useMemo<EditorPuzzles | undefined>(
    () =>
      questions
        ? {
            edit: (level) =>
              new Promise((resolve) => {
                setOpen({ level, resolve });
              }),
          }
        : undefined,
    [questions],
  );
  const strings = useMemo(() => designerStrings(), []);
  const setting = useMemo(() => editorSetting(), []);
  const close = (level: Level | undefined) => {
    open?.resolve(level);
    setOpen(null);
  };
  return {
    puzzles,
    dialog: open ? (
      <Suspense fallback={null}>
        <Designer
          level={open.level}
          setting={setting}
          strings={strings}
          onSave={close}
          onCancel={() => close(undefined)}
        />
      </Suspense>
    ) : null,
  };
}
