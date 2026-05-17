import { Link } from "@tanstack/react-router";
import styles from "./DetailsNav.module.css";

export type DetailsTab = "prompts" | "scenarios";

interface Props {
  model: string;
  variantKey: string;
  activeTab: DetailsTab;
}

export function DetailsNav({ model, variantKey, activeTab }: Props) {
  const promptsActive = activeTab === "prompts";
  const scenariosActive = activeTab === "scenarios";
  return (
    <nav className={styles.detailsNav} aria-label="Details navigation">
      <Link to="/" className={styles.overviewLink}>
        ← Overview
      </Link>
      <span className={styles.divider}>|</span>
      <div className={styles.tabs} role="tablist">
        {promptsActive ? (
          <span
            className={styles.tabActive}
            role="tab"
            aria-current="page"
            aria-selected="true"
          >
            Prompts
          </span>
        ) : (
          <Link
            to="/run/$model/$variant"
            params={{ model, variant: variantKey }}
            className={styles.tab}
            role="tab"
            aria-selected="false"
          >
            Prompts
          </Link>
        )}
        {scenariosActive ? (
          <span
            className={styles.tabActive}
            role="tab"
            aria-current="page"
            aria-selected="true"
          >
            Scenarios
          </span>
        ) : (
          <Link
            to="/run/$model/$variant/scenarios"
            params={{ model, variant: variantKey }}
            className={styles.tab}
            role="tab"
            aria-selected="false"
          >
            Scenarios
          </Link>
        )}
      </div>
    </nav>
  );
}
