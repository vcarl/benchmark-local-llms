import styles from "./ScatterLegend.module.css";

interface Props {
  families: Array<{ name: string; color: string }>;
}

export function ScatterLegend({ families }: Props) {
  return (
    <div className={styles.scatterLegend}>
      <div className={styles.scatterLegendRow}>
        <span className={styles.scatterLegendGroup}>family:</span>
        {families.map((f) => (
          <span key={f.name} className={styles.scatterLegendFamily}>
            <span className={styles.scatterLegendSwatch} style={{ background: f.color }} />
            {f.name}
          </span>
        ))}
      </div>
    </div>
  );
}
