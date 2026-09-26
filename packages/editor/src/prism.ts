import Prism from "prismjs";

// @lexical/code-prism imports the Prism core for its side effects and then the
// language scripts, which read the global. The bundler initialises the
// CommonJS core lazily, so that call landed after the scripts and every page
// failed to hydrate with "Prism is not defined". Reading the export here runs
// the core before anything that imports this module.
(globalThis as { Prism?: typeof Prism }).Prism ??= Prism;
