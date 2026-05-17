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
  let baseUrl = "/";
  return {
    name: "data-js",
    configResolved(config) {
      baseUrl = config.base;
    },
    configureServer(server) {
      server.middlewares.use(`${baseUrl}data.js`, (_req, res, next) => {
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

// gh-pages serves 404.html as a fallback for any path that doesn't exist
// on disk. Duplicating index.html as 404.html makes the SPA handle every
// deep-link URL client-side after reload.
function write404HtmlPlugin(): Plugin {
  return {
    name: "write-404-html",
    writeBundle(options) {
      const indexPath = path.resolve(options.dir ?? "dist", "index.html");
      const notFoundPath = path.resolve(options.dir ?? "dist", "404.html");
      if (fs.existsSync(indexPath)) {
        fs.copyFileSync(indexPath, notFoundPath);
      }
    },
  };
}

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    viteReact(),
    dataJsPlugin(),
    write404HtmlPlugin(),
  ],
  // Matches the gh-pages subpath. Dev URL is http://localhost:5173/benchmark-local-llms/
  base: "/benchmark-local-llms/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
