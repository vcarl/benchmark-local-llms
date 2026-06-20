import { createRootRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { DATA } from "../lib/data";
import { RunGroupTable } from "../components/RunGroupTable";
import { ShiftFrame } from "../components/ShiftFrame";
import { aggregateRuns, type RunRow, type RunSortKey } from "../lib/pipeline";
import styles from "./index.module.css";

export const Route = createRootRoute({ component: RootComponent });

function RootComponent() {
  const location = useLocation();
  const navigate = useNavigate();
  const shifted = location.pathname.startsWith("/run/");

  const [primary, setPrimary] = useState<RunSortKey>("score");
  const [secondary, setSecondary] = useState<RunSortKey>("score");

  const groups = useMemo(() => aggregateRuns(DATA, primary, secondary), [primary, secondary]);
  const closeDetails = () => navigate({ to: "/", search: (s) => s as never });
  const onRowClick = (_row: RunRow) => {};

  const ranking = (
    <RunGroupTable
      groups={groups}
      primary={primary}
      secondary={secondary}
      onPrimaryChange={setPrimary}
      onSecondaryChange={setSecondary}
      onRowClick={onRowClick}
    />
  );

  return (
    <div className={styles.app}>
      <header className={styles.appHeader}>
        <h1>Benchmark Analysis</h1>
        <div className={styles.appSubtitle}>
          {DATA.length} attempts · {groups.length} models
        </div>
      </header>
      <ShiftFrame shifted={shifted} onClose={closeDetails} scatter={null} ranking={ranking} details={<Outlet />} />
    </div>
  );
}
