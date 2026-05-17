import type { SizeRange } from "../lib/data";
import { SIZE_RANGES, modelSizeRange } from "../lib/data";

interface SizeFilterProps {
  allModels: string[];
  checkedModels: Set<string>;
  onChange: (models: Set<string>) => void;
}

export function SizeFilter({
  allModels,
  checkedModels,
  onChange,
}: SizeFilterProps) {
  const rangeMembers = new Map<string, string[]>();
  for (const range of SIZE_RANGES) {
    rangeMembers.set(range.label, []);
  }
  for (const model of allModels) {
    const range = modelSizeRange(model);
    if (range) rangeMembers.get(range.label)!.push(model);
  }

  const handleClick = (range: SizeRange) => {
    const members = rangeMembers.get(range.label) || [];
    const checkedCount = members.filter((m) => checkedModels.has(m)).length;
    const allChecked = checkedCount === members.length;

    const next = new Set(checkedModels);
    if (allChecked) {
      members.forEach((m) => next.delete(m));
    } else {
      members.forEach((m) => next.add(m));
    }
    onChange(next);
  };

  return (
    <div className="family-filter">
      {SIZE_RANGES.map((range) => {
        const members = rangeMembers.get(range.label) || [];
        if (members.length === 0) return null;
        const checkedCount = members.filter((m) => checkedModels.has(m)).length;
        const allChecked = checkedCount === members.length;
        const someChecked = checkedCount > 0 && !allChecked;

        const cls = [
          "family-chip",
          allChecked ? "active" : "",
          someChecked ? "partial" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button key={range.label} className={cls} onClick={() => handleClick(range)}>
            {range.label}
            <span className="count">
              {checkedCount}/{members.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}
