interface FamilyFilterProps {
  families: string[];
  familyMap: Record<string, string[]>;
  checkedModels: Set<string>;
  onChange: (models: Set<string>) => void;
}

export function FamilyFilter({
  families,
  familyMap,
  checkedModels,
  onChange,
}: FamilyFilterProps) {
  const handleClick = (family: string) => {
    const members = familyMap[family] || [];
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
      {families.map((fam) => {
        const members = familyMap[fam] || [];
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
          <button key={fam} className={cls} onClick={() => handleClick(fam)}>
            {fam}
            <span className="count">
              {checkedCount}/{members.length}
            </span>
          </button>
        );
      })}
    </div>
  );
}
