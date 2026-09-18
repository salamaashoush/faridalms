import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

import { paraglideOptions } from "../../paraglide.options.ts";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    paraglideVitePlugin({
      ...paraglideOptions,
      project: "../../project.inlang",
      outdir: "./src/i18n",
    }),
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
});
