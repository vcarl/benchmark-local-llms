import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/run/$model/$variant/scenarios")({
  component: () => <Outlet />,
});
