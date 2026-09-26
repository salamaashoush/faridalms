import "./diagram-assets";
import "@excalidraw/excalidraw/index.css";
import {
  Excalidraw,
  exportToBlob,
  loadFromBlob,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import { useState } from "react";

export default function DiagramBoard({
  scene,
  locale,
  dark,
  onReady,
}: {
  scene: Blob | null;
  locale: string;
  dark: boolean;
  onReady: (
    exporter: () => Promise<{ png: Blob; json: string } | null>,
  ) => void;
}) {
  const [initialData] = useState(() =>
    scene ? loadFromBlob(scene, null, null) : null,
  );
  return (
    <Excalidraw
      excalidrawAPI={(next) => {
        onReady(async () => {
          const elements = next.getSceneElements();
          if (elements.length === 0) return null;
          const appState = next.getAppState();
          const files = next.getFiles();
          const png = await exportToBlob({
            elements,
            appState: {
              ...appState,
              exportBackground: true,
              exportWithDarkMode: false,
            },
            files,
            mimeType: "image/png",
            exportPadding: 24,
          });
          return {
            png,
            json: serializeAsJSON(elements, appState, files, "local"),
          };
        });
      }}
      initialData={initialData}
      langCode={locale === "ar" ? "ar-SA" : "en"}
      theme={dark ? "dark" : "light"}
      UIOptions={{
        canvasActions: {
          loadScene: false,
          saveToActiveFile: false,
          export: false,
          saveAsImage: false,
        },
      }}
      aiEnabled={false}
    />
  );
}
