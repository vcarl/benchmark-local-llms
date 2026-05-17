import { defineConfig, type Plugin } from "vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "node:path";
import fs from "node:fs";

// Serves webapp/src/data/data.js at /data.js in dev and copies it to
// dist/data.js at build time. `./bench report --output webapp/src/data`
// writes the source file; the build fails loudly if it's missing so a
// stale deploy is impossible.
function dataJsPlugin(): Plugin {
  const srcPath = path.resolve(__dirname, "src/data/data.js");
  return {
    name: "data-js",
    configureServer(server) {
      server.middlewares.use("/data.js", (_req, res, next) => {
        if (!fs.existsSync(srcPath)) return next();
        res.setHeader("Content-Type", "application/javascript");
        fs.createReadStream(srcPath).pipe(res);
      });
    },
    writeBundle(options) {
      if (!fs.existsSync(srcPath)) {
        throw new Error(
          "data.js missing — run './bench report --output webapp/src/data' before building",
        );
      }
      const destPath = path.resolve(options.dir ?? "dist", "data.js");
      fs.copyFileSync(srcPath, destPath);
    },
  };
}

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    viteReact(),
    dataJsPlugin(),
  ],
  // Relative base — emits ./assets/... so the dist/ is portable across mount
  // points. Combined with hash routing in report-entry.tsx, the same bundle
  // works at /benchmark-local-llms/ or /benchmark-local-llms/reports/<id>/
  // without rebuild.
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
