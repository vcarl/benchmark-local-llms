import { useNavigate } from "@tanstack/react-router";
import styles from "./RunHeader.module.css";
import { scoreBand } from "../lib/constants";
import { DetailsNav, type DetailsTab } from "./DetailsNav";
import {
  type VariantKey,
  type VariantSummary,
  encodeVariant,
  variantsEqual,
} from "../lib/run-summary";

interface Props {
  model: string;
  active: VariantKey;
  variants: VariantSummary[];
  allExpanded?: boolean;
  onToggleAll?: () => void;
  activeTab: DetailsTab;
}

const formatPercent = (frac: number): string => `${Math.round(frac * 100)}%`;
const formatSec = (s: number): string => (s < 60 ? `${Math.round(s)}s` : `${Math.round(s / 60)}m`);
const formatTokens = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

export function RunHeader({
  model,
  active,
  variants,
  allExpanded,
  onToggleAll,
  activeTab,
}: Props) {
  const navigate = useNavigate();
  const goTo = (v: VariantKey) => {
    if (activeTab === "scenarios") {
      navigate({
        to: "/run/$model/$variant/scenarios",
        params: { model, variant: encodeVariant(v) },
      });
    } else {
      navigate({
        to: "/run/$model/$variant",
        params: { model, variant: encodeVariant(v) },
      });
    }
  };

  const activeSummary = variants.find((s) => variantsEqual(s.key, active));

  return (
    <header className={styles.runHeader}>
      <DetailsNav
        model={model}
        variantKey={encodeVariant(active)}
        activeTab={activeTab}
      />
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{model}</h1>
        {onToggleAll !== undefined && (
          <button
            type="button"
            className={styles.expandToggle}
            onClick={onToggleAll}
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </button>
        )}
      </div>

      <ul className={styles.variantList}>
        {variants.map((s) => {
          const isActive = variantsEqual(s.key, active);
          return (
            <li
              key={encodeVariant(s.key)}
              className={styles.variantRow}
              data-active={isActive}
            >
              <button
                type="button"
                className={styles.variantSummary}
                onClick={() => (isActive ? undefined : goTo(s.key))}
                aria-current={isActive ? "true" : undefined}
                disabled={isActive}
              >
                <VariantLabel variant={s.key} />
                <span
                  className={styles.passRate}
                  data-band={scoreBand(s.passRate)}
                >
                  {formatPercent(s.passRate)} pass
                </span>
                <span className={styles.metric}>{formatSec(s.totalWallSec)}</span>
                <span className={styles.metric}>{formatTokens(s.totalGenerationTokens)} tok</span>
                <span className={styles.metric}>
                  <span className={styles.passCount}>{s.pass}</span>
                  /
                  <span className={styles.failCount}>{s.fail}</span>
                  /
                  <span className={styles.errorCount}>{s.error}</span>
                </span>
              </button>
              {isActive && activeSummary !== undefined && (
                <PerfBreakdown summary={activeSummary} />
              )}
            </li>
          );
        })}
      </ul>
    </header>
  );
}

function VariantLabel({ variant }: { variant: VariantKey }) {
  const quant = variant.quant === "" ? "—" : variant.quant;
  return (
    <span className={styles.variantLabel}>
      <span>{variant.runtime}</span>
      <span className={styles.dot}>·</span>
      <span>{quant}</span>
      <span className={styles.dot}>·</span>
      <span>{variant.temperature}</span>
    </span>
  );
}

// Inline below the active variant: extra perf stats that don't fit the
// one-line summary. Mean tps + peak memory + record count.
function PerfBreakdown({ summary: s }: { summary: VariantSummary }) {
  return (
    <dl className={styles.perfBreakdown}>
      <Stat label="prompts" value={String(s.recordCount)} />
      <Stat label="mean score" value={s.meanScore.toFixed(2)} />
      <Stat label="prompt tps" value={s.meanPromptTps.toFixed(0)} />
      <Stat label="output tps" value={s.meanGenerationTps.toFixed(1)} />
      <Stat
        label="peak mem"
        value={s.peakMemoryGb > 0 ? `${s.peakMemoryGb.toFixed(1)}GB` : "—"}
      />
    </dl>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.perfStat}>
      <dt className={styles.perfLabel}>{label}</dt>
      <dd className={styles.perfValue}>{value}</dd>
    </div>
  );
}
