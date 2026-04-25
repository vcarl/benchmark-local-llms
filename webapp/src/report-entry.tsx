import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter, createBrowserHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const router = createRouter({
  routeTree,
  history: createBrowserHistory(),
  basepath: "/benchmark-local-llms",
  scrollRestoration: true,
});

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
