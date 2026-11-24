import { defineConfig, type Plugin } from "vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "node:path";
import fs from "node:fs";

// Serves webapp/src/data/events/*.json at /events/*.json in dev and copies them
// to dist/ at build time. webapp/public/snapshots/ (written by `./bench report`)
// is plain static content; the build fails loudly if its index is missing so a
// stale or empty deploy is impossible.
function dataJsPlugin(): Plugin {
  const srcDir = path.resolve(__dirname, "src/data");
  const snapshotIndex = path.resolve(__dirname, "public/snapshots/index.json");
  const srcEventsDir = path.join(srcDir, "events");
  return {
    name: "events-and-snapshots",
    configureServer(server) {
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
    buildStart() {
      if (!fs.existsSync(snapshotIndex)) {
        throw new Error("snapshots/index.json missing — run './bench report' before building");
      }
    },
    writeBundle(options) {
      const outDir = options.dir ?? "dist";
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
