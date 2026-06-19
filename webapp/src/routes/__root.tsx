import {
  createRootRoute,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DATA } from "../lib/data";
import { RunGroupTable } from "../components/RunGroupTable";
import { ShiftFrame } from "../components/ShiftFrame";
import { aggregateMatrix } from "../lib/pipeline";
import styles from "./index.module.css";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const location = useLocation();
  const navigate = useNavigate();

  // No drill-down routes remain, but keep ShiftFrame wiring in case we add
  // detail routes later. For now, shifted is always false.
  const shifted = location.pathname.startsWith("/run/");

  const { columns, groups } = useMemo(() => aggregateMatrix(DATA), []);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const handleToggle = (artifact: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(artifact)) next.delete(artifact);
      else next.add(artifact);
      return next;
    });
  };

  const closeDetails = () => navigate({ to: "/", search: (s) => s as never });

  const ranking = (
    <RunGroupTable
      columns={columns}
      groups={groups}
      expanded={expanded}
      onToggle={handleToggle}
    />
  );

  return (
    <div className={styles.app}>
      <header className={styles.appHeader}>
        <h1>Benchmark Analysis</h1>
        <div className={styles.appSubtitle}>
          {DATA.length} runs · {groups.length} artifacts
        </div>
      </header>
      <ShiftFrame
        shifted={shifted}
        onClose={closeDetails}
        scatter={null}
        ranking={ranking}
        details={<Outlet />}
      />
    </div>
  );
}
