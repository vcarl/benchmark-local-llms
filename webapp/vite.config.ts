import { defineConfig, type Plugin } from "vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "node:path";
import fs from "node:fs";

// Serves webapp/src/data/data.js at /data.js and webapp/src/data/events/*.json
// at /events/*.json in dev; copies both to dist/ at build time. `./bench
// report --output webapp/src/data` writes both. The build fails loudly if
// data.js is missing so a stale deploy is impossible.
function dataJsPlugin(): Plugin {
  const srcDir = path.resolve(__dirname, "src/data");
  const srcDataJs = path.join(srcDir, "data.js");
  const srcEventsDir = path.join(srcDir, "events");
  return {
    name: "data-js",
    configureServer(server) {
      server.middlewares.use("/data.js", (_req, res, next) => {
        if (!fs.existsSync(srcDataJs)) return next();
        res.setHeader("Content-Type", "application/javascript");
        fs.createReadStream(srcDataJs).pipe(res);
      });
      server.middlewares.use("/events", (req, res, next) => {
        // Strip leading /events from req.url; default to "/" so we 404 on bare prefix.
        const rel = (req.url ?? "/").replace(/^\/+/, "");
        if (rel === "" || rel.includes("..") || rel.includes("/")) return next();
        const filePath = path.join(srcEventsDir, rel);
        if (!fs.existsSync(filePath)) return next();
        res.setHeader("Content-Type", "application/json");
        fs.createReadStream(filePath).pipe(res);
      });
    },
    writeBundle(options) {
      if (!fs.existsSync(srcDataJs)) {
        throw new Error(
          "data.js missing — run './bench report --output webapp/src/data' before building",
        );
      }
      const outDir = options.dir ?? "dist";
      fs.copyFileSync(srcDataJs, path.resolve(outDir, "data.js"));
      if (fs.existsSync(srcEventsDir)) {
        fs.cpSync(srcEventsDir, path.resolve(outDir, "events"), { recursive: true });
      }
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
