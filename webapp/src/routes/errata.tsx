import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import type { ReactNode } from "react";
import processMd from "../../../docs/ERRATA-PROCESS.md?raw";
import {
  type Block,
  errataOnRelease,
  KIND_LABEL,
  parseInline,
  parseMarkdown,
  releaseName,
  releaseStatusLabel,
  scoresChangedLabel,
} from "../lib/errata";
import { entryFor, releaseHeading, useIndex, useSnapshot } from "../lib/snapshots";
import styles from "./errata.module.css";

// Public errata page: docs/ERRATA-PROCESS.md (the public summary of
// docs/ERRATA.md) above one release's errata, from the release's newest
// snapshot. `release` picks it; the default is the selected dataset's release.
export const Route = createFileRoute("/errata")({
  component: ErrataPage,
  validateSearch: (s: Record<string, unknown>): { release?: string } =>
    s.release === undefined ? {} : { release: String(s.release) },
});

const BLOCKS = parseMarkdown(processMd);

const inline = (text: string): ReactNode[] =>
  parseInline(text).map((t, i) => {
    switch (t.type) {
      case "strong":
        return <strong key={i}>{t.text}</strong>;
      case "code":
        return <code key={i}>{t.text}</code>;
      case "link":
        return (
          <a key={i} href={t.href} target="_blank" rel="noreferrer">
            {t.text}
          </a>
        );
      case "text":
        return t.text;
    }
  });

const block = (b: Block, i: number): ReactNode => {
  switch (b.type) {
    case "h":
      return b.level === 1 ? <h2 key={i}>{inline(b.text)}</h2> : <h3 key={i}>{inline(b.text)}</h3>;
    case "p":
      return <p key={i}>{inline(b.text)}</p>;
    case "ul":
      return (
        <ul key={i}>
          {b.items.map((item, j) => (
            <li key={j}>{inline(item)}</li>
          ))}
        </ul>
      );
  }
};

function ErrataPage() {
  const index = useIndex();
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const list = index.status === "loaded" ? index.value : [];
  const release = search.release === undefined ? entryFor(list, String(search.set ?? ""))?.release : String(search.release);
  // The release's newest snapshot: its first index entry.
  const entry = list.find((e) => e.release === release);
  const snapshot = useSnapshot(entry);
  const ds = snapshot.status === "loaded" ? snapshot.value.dataset : undefined;
  const errata = ds === undefined || release == null ? [] : errataOnRelease(ds.errata, release);
  return (
    <div className={styles.page}>
      <article className={styles.doc}>
        <Link to="/" className={styles.back}>
          ← Overview
        </Link>
        {BLOCKS.map(block)}
        <h3>Errata · {releaseHeading(release ?? null)}</h3>
        <p className={styles.evalLine}>
          {ds !== undefined && release != null ? (
            <>
              {ds.version !== null && (
                <>
                  Eval <code>{ds.version}</code> ·{" "}
                </>
              )}
              {releaseName(release)} · {errata.length} errata ·{" "}
              <Link to="/release/$release" params={{ release }}>
                release notes
              </Link>
            </>
          ) : snapshot.status === "error" ? (
            snapshot.message
          ) : entry === undefined && index.status === "loaded" ? (
            `No dataset of ${releaseHeading(release ?? null)} in the index.`
          ) : (
            "Loading…"
          )}
        </p>
        <ol className={styles.list}>
          {errata.map((e) => (
            <li key={e.id} id={e.id} className={styles.entry}>
              <div className={styles.entryHead}>
                <span className={styles.id}>{e.id}</span>
                <span className={styles.kind}>{KIND_LABEL[e.kind]}</span>
                <span className={styles.date}>{e.date}</span>
              </div>
              <p>{inline(e.description)}</p>
              <div className={styles.meta}>
                <span>{scoresChangedLabel(e)}</span>
                <span>{releaseStatusLabel(e)}</span>
              </div>
              <details className={styles.items}>
                <summary>
                  {e.items.length} {e.items.length === 1 ? "item" : "items"}
                </summary>
                <ul>
                  {e.items.map((k) => (
                    <li key={k}>
                      <code>{k}</code>
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ol>
      </article>
    </div>
  );
}
