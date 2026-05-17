import "./styles/tokens.css";
import "./styles/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter, createHashHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Hash routing keeps every route under `#`, so the bundle is portable —
// the same dist/ works at any mount point on gh-pages without rebuild.
const router = createRouter({
  routeTree,
  history: createHashHistory(),
  scrollRestoration: true,
});

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
