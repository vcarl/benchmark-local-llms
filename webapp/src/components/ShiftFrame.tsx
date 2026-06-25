import { useEffect, type ReactNode } from "react";
import styles from "./ShiftFrame.module.css";

interface Props {
  shifted: boolean;
  onClose: () => void;
  scatter: ReactNode;
  ranking: ReactNode;
  details: ReactNode;
}

export function ShiftFrame({ shifted, onClose, scatter, ranking, details }: Props) {
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
      {shifted && (
        <div className={styles.sheetBackdrop} onClick={onClose} aria-hidden="true" />
      )}
      <div className={styles.shiftCanvas} data-shifted={shifted}>
        <div className={styles.regionScatter}>{scatter}</div>
        <div className={styles.regionRanking}>{ranking}</div>
        <div className={styles.regionDetails}>
          <button
            type="button"
            className={styles.sheetClose}
            onClick={onClose}
            aria-label="Close details"
          >
            ×
          </button>
          {details}
        </div>
      </div>
    </div>
  );
}
