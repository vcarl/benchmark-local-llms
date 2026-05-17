import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/run/$model/$variant")({
  component: () => <Outlet />,
});
