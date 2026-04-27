import styles from "./CapabilityHoverCard.module.css";
import type { ListCapability } from "../lib/pipeline";
import { scoreBand } from "../lib/constants";

interface Props {
  title: string;
  capability: ListCapability[];
}

export function CapabilityHoverCard({ title, capability }: Props) {
  return (
    <div className={styles.capHoverCard} role="tooltip">
      <div className={styles.capHoverTitle}>{title} · capability profile</div>
      <table className={styles.capHoverTable}>
        <tbody>
          {capability.map((c) => (
            <tr key={c.tag}>
              <td className={styles.ctTag}>{c.tag}</td>
              <td className={styles.ctBar}>
                <div className={styles.ctBarTrack}>
                  {c.pass !== null && (
                    <div
                      className={styles.ctBarFill}
                      data-band={scoreBand(c.pass)}
                      style={{ width: `${c.pass * 100}%` }}
                    />
                  )}
                </div>
              </td>
              <td className={styles.ctVal}>
                {c.pass === null ? "—" : `${Math.round(c.pass * 100)}%`}
              </td>
              <td className={styles.ctRuns}>
                {c.runs === 0 ? "no data" : `${c.runs} runs`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
