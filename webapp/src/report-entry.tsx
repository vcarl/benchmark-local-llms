import "./styles/tokens.css";
import "./styles/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter, createHashHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Hash routing keeps every route under `#`, so one index.html serves every view
// at any mount point (and behind the vcarl.com/evals proxy, docs/DEPLOY.md).
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
