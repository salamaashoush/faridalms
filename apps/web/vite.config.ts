import type { Plugin } from "vite";

import { compile, paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { createReadStream, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

import { paraglideOptions } from "../../paraglide.options.ts";

// A build tree-shakes Paraglide's one module per message route by route, but
// the dev server would serve all 4,400 of them to every page. It serves one
// module per language from its own folder instead, while src/i18n stays
// compiled for the type-checker and the build.
const devMessages = fileURLToPath(new URL("./src/i18n-dev/", import.meta.url));

// Paraglide's own plugin keeps its state per process, so a second instance
// never recompiles; the dev copy is compiled here instead, on start and on
// every change to a catalogue.
const compileDevCatalogue = () =>
  compile({
    ...paraglideOptions,
    project: "../../project.inlang",
    outdir: "./src/i18n-dev",
    outputStructure: "locale-modules",
  });

function devCatalogue(): Plugin {
  const messages = fileURLToPath(new URL("../../messages/", import.meta.url));
  return {
    name: "farida:dev-catalogue",
    apply: "serve",
    async buildStart() {
      await compileDevCatalogue();
    },
    configureServer(server) {
      server.watcher.add(messages);
      server.watcher.on("change", (file) => {
        if (!resolve(file).startsWith(messages)) return;
        // Vite keeps the catalogue it compiled until told it changed. A
        // catalogue saved half-written fails until the next save.
        compileDevCatalogue()
          .then(() => {
            for (const environment of Object.values(server.environments))
              environment.moduleGraph.invalidateAll();
            server.ws.send({ type: "full-reload" });
          })
          .catch((error: unknown) => server.config.logger.error(String(error)));
      });
    },
  };
}

const builtMessages = fileURLToPath(
  new URL("./src/i18n/messages/", import.meta.url),
);

/**
 * Arabic messages write their numbers in the school's digits. Paraglide
 * interpolates a number as it was given, so each Arabic message's words pass
 * through `arabicDigits` as the message returns them, in the build's one
 * module per message and the dev server's one module per language alike.
 */
function arabicDigitsInMessages(): Plugin {
  return {
    name: "farida:arabic-digits",
    transform(code, id) {
      if (!id.startsWith(builtMessages) && !id.startsWith(devMessages))
        return null;
      const next = code.replaceAll(
        /return (ar_\w+|__ar\.\w+)\(inputs\)/g,
        "return arabicDigits($1(inputs))",
      );
      return next === code
        ? null
        : {
            code: `import { arabicDigits } from "~/utils/digits";\n${next}`,
            map: null,
          };
    },
  };
}

const pyodideDir = dirname(
  createRequire(import.meta.url).resolve("pyodide/package.json"),
);
const pyodideVersion = (
  JSON.parse(readFileSync(join(pyodideDir, "package.json"), "utf8")) as {
    version: string;
  }
).version;
const pyodideBase = `/pyodide/${pyodideVersion}/`;
const pyodideFiles: Record<string, string> = {
  "pyodide.mjs": "text/javascript",
  "pyodide.asm.mjs": "text/javascript",
  "pyodide.asm.wasm": "application/wasm",
  "python_stdlib.zip": "application/zip",
  "pyodide-lock.json": "application/json",
};
// Student code runs in a sandboxed frame with an opaque origin, which can
// load Python only from files that allow any origin.
const pyodideHeaders = {
  "access-control-allow-origin": "*",
  "cache-control": "public, max-age=31536000, immutable",
};

// The block editor's own pictures and cursors, which it asks for by address
// rather than importing; left alone it would fetch them from its makers.
const blocklyDir = join(
  dirname(
    createRequire(
      new URL("../../packages/puzzles/package.json", import.meta.url),
    ).resolve("blockly"),
  ),
  "media",
);
const blocklyBase = "/blockly/media/";
const mediaTypes: Record<string, string> = {
  ".cur": "image/x-icon",
  ".gif": "image/gif",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
const blocklyFiles = Object.fromEntries(
  readdirSync(blocklyDir).flatMap((file) => {
    const type = mediaTypes[extname(file)];
    return type ? [[file, type]] : [];
  }),
);
const blocklyHeaders = { "cache-control": "public, max-age=86400" };

/**
 * Serves files of an installed package as they are, under one address,
 * and copies them into the build: Python for the browser under its
 * version, so a new release is a new address, and the block editor's
 * media.
 */
function packageAssets(assets: {
  name: string;
  dir: string;
  base: string;
  files: Record<string, string>;
  headers: Record<string, string>;
}): Plugin {
  return {
    name: `farida:${assets.name}`,
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?")[0] ?? "";
        if (!path.startsWith(assets.base)) {
          next();
          return;
        }
        const file = path.slice(assets.base.length);
        const type = assets.files[file];
        if (!type) {
          response.statusCode = 404;
          response.end();
          return;
        }
        response.setHeader("content-type", type);
        for (const [name, value] of Object.entries(assets.headers))
          response.setHeader(name, value);
        createReadStream(join(assets.dir, file)).pipe(response);
      });
    },
    generateBundle() {
      if (this.environment.name !== "client") return;
      for (const file of Object.keys(assets.files))
        this.emitFile({
          type: "asset",
          fileName: `${assets.base.slice(1)}${file}`,
          source: readFileSync(join(assets.dir, file)),
        });
    },
  };
}

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
    devCatalogue(),
    arabicDigitsInMessages(),
    packageAssets({
      name: "pyodide",
      dir: pyodideDir,
      base: pyodideBase,
      files: pyodideFiles,
      headers: pyodideHeaders,
    }),
    packageAssets({
      name: "blockly",
      dir: blocklyDir,
      base: blocklyBase,
      files: blocklyFiles,
      headers: blocklyHeaders,
    }),
    // tanstackStart must precede viteReact.
    tanstackStart({ srcDirectory: "src" }),
    viteReact(),
    nitro({
      // Nitro app plugins run once at server init, before the first request.
      // preflight validates the environment there, so a misconfigured container
      // exits instead of booting and serving 500s.
      plugins: ["./src/server/preflight.ts"],
      routeRules: {
        [`${pyodideBase}**`]: { headers: pyodideHeaders },
        [`${blocklyBase}**`]: { headers: blocklyHeaders },
      },
    }),
  ],
}));
