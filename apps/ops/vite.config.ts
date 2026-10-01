import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 3004,
  },
  // The directory store opens Bun's own Postgres client, which exists only on
  // the server at run time.
  optimizeDeps: { exclude: ["bun"] },
  ssr: { external: ["bun"] },
  build: { rolldownOptions: { external: ["bun"] } },
  plugins: [
    tailwindcss(),
    // tanstackStart must precede viteReact.
    tanstackStart({ srcDirectory: "src" }),
    viteReact(),
    nitro(),
  ],
});
