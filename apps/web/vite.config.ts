import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

import { paraglideOptions } from "../../paraglide.options.ts";

// A build tree-shakes Paraglide's one module per message route by route, but
// the dev server would serve all 4,400 of them to every page. It serves one
// module per language from its own folder instead, while src/i18n stays
// compiled for the type-checker and the build.
const devMessages = fileURLToPath(new URL("./src/i18n-dev/", import.meta.url));

export default defineConfig(({ command }) => ({
  server: {
    host: "127.0.0.1",
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
    alias:
      command === "serve"
        ? [{ find: /^~\/i18n\//, replacement: devMessages }]
        : [],
  },
  plugins: [
    tailwindcss(),
    paraglideVitePlugin({
      ...paraglideOptions,
      project: "../../project.inlang",
      outdir: "./src/i18n",
    }),
    command === "serve"
      ? paraglideVitePlugin({
          ...paraglideOptions,
          project: "../../project.inlang",
          outdir: "./src/i18n-dev",
          outputStructure: "locale-modules",
        })
      : null,
    // tanstackStart must precede viteReact.
    tanstackStart({ srcDirectory: "src" }),
    viteReact(),
    nitro({
      // Nitro app plugins run once at server init, before the first request.
      // preflight validates the environment there, so a misconfigured container
      // exits instead of booting and serving 500s.
      plugins: ["./src/server/preflight.ts"],
    }),
  ],
}));
