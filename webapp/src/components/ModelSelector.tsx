interface ModelSelectorProps {
  allModels: string[];
  checkedModels: Set<string>;
  onChange: (model: string, checked: boolean) => void;
  onSelectAll: (selected: boolean) => void;
}

export function ModelSelector({
  allModels,
  checkedModels,
  onChange,
  onSelectAll,
}: ModelSelectorProps) {
  return (
    <div className="controls">
      <div className="model-selector">
        <a onClick={() => onSelectAll(true)}>Select All</a>
        <a onClick={() => onSelectAll(false)}>Deselect All</a>
        {allModels.map((model) => (
          <label key={model}>
            <input
              type="checkbox"
              checked={checkedModels.has(model)}
              onChange={(e) => onChange(model, e.target.checked)}
            />
            {" " + model}
          </label>
        ))}
      </div>
    </div>
  );
}
