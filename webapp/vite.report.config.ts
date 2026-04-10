import { defineConfig, type Plugin } from "vite";
import viteReact from "@vitejs/plugin-react";
import path from "path";

/**
 * Post-build plugin that:
 * 1. Renames report.html → index.html
 * 2. Removes type="module" from script tags (required for file:// protocol)
 * 3. Ensures data.js loads before app.js
 */
function reportHtmlPlugin(): Plugin {
  return {
    name: "report-html-fixup",
    enforce: "post",
    generateBundle(_, bundle) {
      // Find the HTML asset and rename it
      const htmlKey = Object.keys(bundle).find((k) => k.endsWith(".html"));
      if (htmlKey && bundle[htmlKey].type === "asset") {
        const asset = bundle[htmlKey];
        let html = typeof asset.source === "string"
          ? asset.source
          : new TextDecoder().decode(asset.source as Uint8Array);

        // Remove all script tags from wherever Vite placed them
        const scriptTags: string[] = [];
        html = html.replace(
          /<script[^>]*src="[^"]*"[^>]*><\/script>\s*/g,
          (match) => {
            scriptTags.push(match.trim());
            return "";
          },
        );

        // Remove type="module" and crossorigin from collected script tags
        const cleanedScripts = scriptTags.map((tag) =>
          tag.replace(/\s+type="module"/, "").replace(/\s+crossorigin/, ""),
        );

        // Sort: data.js first, then app.js
        cleanedScripts.sort((a, b) => {
          if (a.includes("data.js")) return -1;
          if (b.includes("data.js")) return 1;
          return 0;
        });

        // Insert scripts at the end of body, before </body>
        const scriptsHtml = cleanedScripts
          .map((s) => "  " + s)
          .join("\n");
        html = html.replace("</body>", scriptsHtml + "\n</body>");

        asset.source = html;
        asset.fileName = "index.html";

        // Remove old key and add new one
        delete bundle[htmlKey];
        bundle["index.html"] = asset;
      }
    },
  };
}

export default defineConfig({
  plugins: [viteReact(), reportHtmlPlugin()],
  root: path.resolve(__dirname),
  base: "./",
  build: {
    outDir: "dist-report",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "report.html"),
      output: {
        format: "iife",
        entryFileNames: "app.js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) return "styles.css";
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
});
