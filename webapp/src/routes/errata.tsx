import { createFileRoute, Link } from "@tanstack/react-router";
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
} from "../lib/errata";
import { DATASETS } from "../lib/rows";
import styles from "./errata.module.css";

// Public errata page: docs/ERRATA-PROCESS.md (the public summary of
// docs/ERRATA.md) above the live registry the report emitted from errata.yaml.
export const Route = createFileRoute("/errata")({
  component: ErrataPage,
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
  const ds = DATASETS[0]?.dataset;
  const errata = ds?.errata ?? [];
  return (
    <div className={styles.page}>
      <article className={styles.doc}>
        <Link to="/" className={styles.back}>
          ← Overview
        </Link>
        {BLOCKS.map(block)}
        <h3>Errata</h3>
        <p className={styles.baseline}>
          {ds !== undefined && ds.release !== null && ds.version !== null ? (
            <>
              Eval <code>{ds.version}</code> · {releaseName(ds.release)} baseline ·{" "}
              {errataOnRelease(errata, ds.release).length} errata
            </>
          ) : (
            `${errata.length} errata`
          )}
          {ds?.generatedAt !== undefined && ` · as of ${ds.generatedAt.slice(0, 10)}`}
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
                <span>{e.scorerChange ? "Changes scores" : "No score change"}</span>
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
