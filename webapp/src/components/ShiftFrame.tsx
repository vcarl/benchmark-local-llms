import { useEffect, type ReactNode } from "react";
import styles from "./ShiftFrame.module.css";
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
    <div className={styles.shiftFrame}>
      <div className={styles.shiftCanvas} data-shifted={shifted}>
        <div className={styles.regionScatter}>{scatter}</div>
        <div className={styles.regionRanking}>{ranking}</div>
        <div className={styles.regionDetails}>{details}</div>
        <button
          type="button"
          className={styles.backOverlay}
          onClick={onClose}
          aria-label="Back to overview"
        >
          ← Overview
        </button>
      </div>
    </div>
  );
}
