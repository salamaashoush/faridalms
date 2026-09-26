import type { NodeKey } from "lexical";

import { Dialog } from "@base-ui/react/dialog";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $isParagraphNode,
  COMMAND_PRIORITY_LOW,
} from "lexical";
import { LoaderCircle } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { $anchorFor } from "../blocks";
import { useEditorEnvironment } from "../context";
import {
  $createDiagramNode,
  $isDiagramNode,
  EDIT_DIAGRAM_COMMAND,
} from "../nodes";

const DiagramBoard = lazy(() => import("../DiagramBoard"));

type Exporter = () => Promise<{ png: Blob; json: string } | null>;

interface Session {
  nodeKey: NodeKey | null;
  anchorKey: NodeKey | null;
  scene: Blob | null;
}

export function DiagramPlugin() {
  const [editor] = useLexicalComposerContext();
  const { strings, media, locale } = useEditorEnvironment();
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const exporter = useRef<Exporter | null>(null);

  useEffect(() => {
    if (!media) return undefined;
    return editor.registerCommand(
      EDIT_DIAGRAM_COMMAND,
      (nodeKey) => {
        const node = nodeKey ? $getNodeByKey(nodeKey) : null;
        const sceneFileId = $isDiagramNode(node) ? node.getSceneFileId() : null;
        const anchorKey = $anchorFor("diagram")?.getKey() ?? null;
        setFailed(false);
        if (!sceneFileId) {
          setSession({ nodeKey: null, anchorKey, scene: null });
          return true;
        }
        void fetch(media.url(sceneFileId))
          .then((response) => {
            if (!response.ok) throw new Error(String(response.status));
            return response.blob();
          })
          .then((scene) => setSession({ nodeKey, anchorKey, scene }))
          .catch(() => setSession({ nodeKey, anchorKey, scene: null }));
        return true;
      },
      COMMAND_PRIORITY_LOW,
    );
  }, [editor, media]);

  if (!media) return null;

  const save = async () => {
    const current = session;
    const exported = await exporter.current?.();
    if (!current) return;
    if (!exported) {
      setSession(null);
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const [png, scene] = await Promise.all([
        media.upload(
          new File([exported.png], "drawing.png", { type: "image/png" }),
          "diagram",
        ),
        media.upload(
          new File([exported.json], "drawing.excalidraw", {
            type: "application/json",
          }),
          "scene",
        ),
      ]);
      editor.update(() => {
        const existing = current.nodeKey
          ? $getNodeByKey(current.nodeKey)
          : null;
        if ($isDiagramNode(existing)) {
          existing.setFiles(png.fileId, scene.fileId);
          return;
        }
        const node = $createDiagramNode(png.fileId, scene.fileId);
        const anchor = current.anchorKey
          ? $getNodeByKey(current.anchorKey)
          : null;
        if (!anchor || !anchor.isAttached()) $getRoot().append(node);
        else if ($isParagraphNode(anchor) && anchor.getTextContentSize() === 0)
          anchor.replace(node);
        else anchor.insertAfter(node);
        if (!node.getNextSibling()) node.insertAfter($createParagraphNode());
      });
      setSession(null);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const dark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  return (
    <Dialog.Root
      open={session !== null}
      onOpenChange={(open) => {
        if (!open && !busy) setSession(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Popup className="fixed inset-2 z-50 flex flex-col overflow-hidden rounded-xl border bg-background shadow-2xl outline-none sm:inset-6">
          <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
            <Dialog.Title className="text-base font-semibold">
              {strings.diagram}
            </Dialog.Title>
            <div className="flex items-center gap-2">
              {failed ? (
                <p role="alert" className="text-sm text-destructive">
                  {strings.uploadFailed}
                </p>
              ) : null}
              <Dialog.Close
                disabled={busy}
                className="inline-flex h-9 items-center rounded-md border px-3.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
              >
                {strings.cancel}
              </Dialog.Close>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save()}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {busy ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden />
                ) : null}
                {strings.diagramSave}
              </button>
            </div>
          </div>
          <div className="relative min-h-0 flex-1" dir="ltr">
            {session ? (
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                    {strings.diagramLoading}
                  </div>
                }
              >
                <DiagramBoard
                  scene={session.scene}
                  locale={locale}
                  dark={dark}
                  onReady={(next) => {
                    exporter.current = next;
                  }}
                />
              </Suspense>
            ) : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
