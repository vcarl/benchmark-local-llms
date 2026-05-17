import { createFileRoute } from "@tanstack/react-router";

// The home URL ("/") shows the canvas in overview position. The root layout
// (routes/__root.tsx) owns scatter + filters + ranking and renders an
// <Outlet /> in the details region; "/" contributes nothing to that outlet.
export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return null;
}
