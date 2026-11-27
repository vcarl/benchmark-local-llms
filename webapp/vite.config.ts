import { defineConfig, type Plugin } from "vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import path from "node:path";
import fs from "node:fs";

// Deploy URLs (docs/DEPLOY.md; scripts/deploy-pages.sh sets both).
// PAGES_ORIGIN: where the bundle and snapshots are served from. Unset, the base
// is relative (`./`) and the dist/ works at any mount point; set, every asset
// and data URL is absolute, so a page proxied from another host still loads its
// bytes from this origin.
// SITE_URL: the page's public URL, used for the canonical link and the llms.txt
// pointers in index.html; unset, they are relative.
const pagesOrigin = process.env.PAGES_ORIGIN;
const siteUrl = process.env.SITE_URL ?? "./";

// webapp/public/snapshots/ (written by `./bench report`) is plain static
// content; the build fails loudly if its index is missing so a stale or empty
// deploy is impossible. `%SITE_URL%` in index.html becomes the site URL.
function siteBuildPlugin(): Plugin {
  const snapshotIndex = path.resolve(__dirname, "public/snapshots/index.json");
  return {
    name: "snapshots-and-site-url",
    buildStart() {
      if (!fs.existsSync(snapshotIndex)) {
        throw new Error("snapshots/index.json missing — run './bench report' before building");
      }
    },
    transformIndexHtml: (html) => html.replaceAll("%SITE_URL%", siteUrl),
  };
}

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    viteReact(),
    siteBuildPlugin(),
  ],
  // Hash routing (report-entry.tsx) keeps every route under `#`, so either base
  // serves every route from the one index.html.
  base: pagesOrigin ?? "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
