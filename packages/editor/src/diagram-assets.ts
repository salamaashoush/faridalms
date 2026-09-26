// Excalidraw loads its hand-drawn fonts from a public CDN unless told
// otherwise. The web app serves them itself so drawing sends nothing to a
// third party; this must run before the Excalidraw module evaluates.
(window as { EXCALIDRAW_ASSET_PATH?: string }).EXCALIDRAW_ASSET_PATH ??=
  "/excalidraw/";
