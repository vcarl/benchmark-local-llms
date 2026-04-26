import { useEffect, type ReactNode } from "react";
import { isShifted } from "../lib/shift-state";

interface Props {
  model: string | undefined;
  onClose: () => void;
  scatter: ReactNode;
  ranking: ReactNode;
  details: ReactNode;
}

export function ShiftFrame({ model, onClose, scatter, ranking, details }: Props) {
  const shifted = isShifted(model);

  useEffect(() => {
    if (!shifted) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [shifted, onClose]);

  return (
    <div className="shift-frame">
      <div className={shifted ? "shift-canvas shifted" : "shift-canvas"}>
        <div className="region-scatter">{scatter}</div>
        <div className="region-ranking">{ranking}</div>
        <div className="region-details">{details}</div>
        <button
          type="button"
          className="back-overlay"
          onClick={onClose}
          aria-label="Back to overview"
        >
          ← Overview
        </button>
      </div>
    </div>
  );
}
