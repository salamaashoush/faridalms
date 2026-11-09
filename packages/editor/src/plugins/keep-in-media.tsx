import type { NodeKey } from "lexical";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey } from "lexical";
import { Check, Images, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { useEditorEnvironment } from "../context";
import { $isImageNode } from "../nodes/media";

export interface KeepInMediaProps {
  nodeKey: NodeKey;
  fileId: string;
  className: string;
}

/**
 * Keeps a picture shown in the document in the school's media too,
 * with the words the document gives it, so it can be chosen again elsewhere.
 */
export function KeepInMedia({ nodeKey, fileId, className }: KeepInMediaProps) {
  const [editor] = useLexicalComposerContext();
  const { media, strings } = useEditorEnvironment();
  const [state, setState] = useState<"idle" | "busy" | "kept" | "failed">(
    "idle",
  );
  const keep = media?.school?.keep;
  if (!keep) return null;
  return (
    <button
      type="button"
      disabled={state === "busy" || state === "kept"}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        const words = editor.getEditorState().read(() => {
          const node = $getNodeByKey(nodeKey);
          if (!$isImageNode(node)) return null;
          const json = node.exportJSON();
          return {
            alt: json.decorative ? "" : json.alt,
            ...(json.credit ? { credit: json.credit } : {}),
          };
        });
        if (!words) return;
        setState("busy");
        keep(fileId, words).then(
          () => setState("kept"),
          () => setState("failed"),
        );
      }}
      className={className}
    >
      {state === "busy" ? (
        <LoaderCircle aria-hidden className="animate-spin" />
      ) : state === "kept" ? (
        <Check aria-hidden />
      ) : (
        <Images aria-hidden />
      )}
      <span aria-live="polite">
        {state === "kept"
          ? strings.mediaKept
          : state === "failed"
            ? strings.mediaKeepFailed
            : strings.mediaKeep}
      </span>
    </button>
  );
}
