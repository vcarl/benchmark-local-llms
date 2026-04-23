import { CAPABILITY_TAGS, scoreBand, type CapabilityTag } from "../lib/constants";

interface Props {
  profile: Record<string, { mean: number; count: number }>;
  height?: number;
}

export function CapabilityBar({ profile, height = 8 }: Props) {
  return (
    <div className="capability-bar" role="img" aria-label="capability profile">
      {CAPABILITY_TAGS.map((tag: CapabilityTag) => {
        const cell = profile[tag];
        if (cell === undefined) {
          return (
            <div
              key={tag}
              className="cap-cell cap-absent"
              style={{ height }}
              title={`${tag}: no runs`}
            />
          );
        }
        return (
          <div
            key={tag}
            className={`cap-cell cap-${scoreBand(cell.mean)}`}
            style={{ height }}
            title={`${tag}: ${cell.mean.toFixed(2)} (${cell.count} runs)`}
          />
        );
      })}
    </div>
  );
}
