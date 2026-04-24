import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

// The webapp is a client-only dashboard — data comes from a local data.js
// script and filter state lives in the URL + localStorage. SSR adds nothing
// and causes hydration mismatches: FilterBar reads localStorage at render
// time, which the server can't replicate, so the SSR tree ends up orphaned
// when React bails on hydration.
export default defineConfig({
  plugins: [
    tanstackStart({
      spa: { enabled: true },
      prerender: { enabled: false },
    }),
    viteReact(),
  ],
});
