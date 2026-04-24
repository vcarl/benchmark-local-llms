import type { ListCapability } from "../lib/pipeline";
import { scoreBand } from "../lib/constants";

interface Props {
  title: string;
  capability: ListCapability[];
}

export function CapabilityHoverCard({ title, capability }: Props) {
  return (
    <div className="cap-hover-card" role="tooltip">
      <div className="cap-hover-title">{title} · capability profile</div>
      <table className="cap-hover-table">
        <tbody>
          {capability.map((c) => (
            <tr key={c.tag}>
              <td className="ct-tag">{c.tag}</td>
              <td className="ct-bar">
                <div className="ct-bar-track">
                  {c.pass !== null && (
                    <div
                      className={`ct-bar-fill cap-${scoreBand(c.pass)}`}
                      style={{ width: `${c.pass * 100}%` }}
                    />
                  )}
                </div>
              </td>
              <td className="ct-val">
                {c.pass === null ? "—" : `${Math.round(c.pass * 100)}%`}
              </td>
              <td className="ct-runs">
                {c.runs === 0 ? "no data" : `${c.runs} runs`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
