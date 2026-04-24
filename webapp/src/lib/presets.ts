const KEY = "llm-bench.presets";

export type PresetStore = Record<string, string>;

export const DEFAULT_PRESETS: PresetStore = {
  "Task-first: agentic":
    "tags=long-term-planning,tool-use&groupBy=model&sort=-meanScore",
  "Model-first: all":
    "groupBy=model&sort=-meanScore",
  "Capability leaderboard":
    "groupBy=tag&sort=-meanScore",
  "Needs review":
    "tags=TODO&groupBy=prompt&sort=name",
};

export const loadPresets = (): PresetStore => {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as PresetStore;
  } catch {
    return {};
  }
};

export const savePresets = (store: PresetStore): void => {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(store));
};

export const seedIfEmpty = (): void => {
  if (Object.keys(loadPresets()).length === 0) savePresets({ ...DEFAULT_PRESETS });
};

export const upsertPreset = (name: string, body: string): void => {
  const store = loadPresets();
  store[name] = body;
  savePresets(store);
};

export const deletePreset = (name: string): void => {
  const store = loadPresets();
  delete store[name];
  savePresets(store);
};

export const renamePreset = (oldName: string, newName: string): void => {
  const store = loadPresets();
  if (!(oldName in store) || oldName === newName) return;
  store[newName] = store[oldName];
  delete store[oldName];
  savePresets(store);
};

export const resetPresets = (): void => savePresets({ ...DEFAULT_PRESETS });
