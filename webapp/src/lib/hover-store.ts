import { useSyncExternalStore } from "react";

type Listener = () => void;

let hovered: string | null = null;
const listeners = new Set<Listener>();

export const getHoveredModel = (): string | null => hovered;

export const setHoveredModel = (model: string): void => {
  if (hovered === model) return;
  hovered = model;
  for (const l of listeners) l();
};

export const clearHoveredModel = (): void => {
  if (hovered === null) return;
  hovered = null;
  for (const l of listeners) l();
};

export const subscribeHover = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useHoveredModel = (): string | null =>
  useSyncExternalStore(subscribeHover, getHoveredModel, getHoveredModel);
