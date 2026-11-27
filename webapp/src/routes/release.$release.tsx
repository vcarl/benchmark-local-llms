import { createFileRoute, Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { datasetTags } from "../components/ControlColumn";
import { releaseHeading, useIndex, useSnapshot } from "../lib/snapshots";
import styles from "./errata.module.css";

// Release notes: one release's identity, dates, commitment, challenges, the
// snapshots indexed for it, and how to verify them. Read from the release's
// newest snapshot (its first index entry).
export const Route = createFileRoute("/release/$release")({
  component: ReleasePage,
});

const NO_COMMITMENT: Record<string, string> = {
  "0": "the alpha challenge set predates commitments.",
  draft: "the pre-release is uncommitted; its items may still change.",
};

function ReleasePage() {
  const { release } = Route.useParams();
  const index = useIndex();
  const entries = index.status === "loaded" ? index.value.filter((e) => e.release === release) : [];
  const snapshot = useSnapshot(entries[0]);
  const back = (
    <Link to="/" className={styles.back}>
      ← Overview
    </Link>
  );
  if (snapshot.status !== "loaded")
    return (
      <div className={styles.page}>
        <article className={styles.doc}>
          {back}
          <h2>{releaseHeading(release)}</h2>
          <p>
            {index.status === "loaded" && entries.length === 0
              ? "No snapshot of this release is in the index."
              : snapshot.status === "error"
                ? snapshot.message
                : "Loading…"}
          </p>
        </article>
      </div>
    );
  const ds = snapshot.value;
  const rf = ds.releaseFile;
  const items = ds.challengeSet.reduce((s, c) => s + c.items, 0);
  const dates = (
    [
      ["Date", rf.date],
      ["Committed", rf.committedAt],
      ["Closed", rf.closed],
    ] as const
  ).filter(([, v]) => v !== undefined);
  const tags = datasetTags(ds.dataset);
  return (
    <div className={styles.page}>
      <article className={styles.doc}>
        {back}
        <h2>{releaseHeading(release)}</h2>
        <dl className={styles.facts}>
          <dt>Release</dt>
          <dd>
            <code>{rf.release}</code>
            {rf.label !== undefined && ` · ${rf.label}`}
            {tags.length > 0 && ` · ${tags.join(" · ")}`}
          </dd>
          {dates.map(([k, v]) => (
            <Fragment key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </Fragment>
          ))}
          <dt>Commitment</dt>
          <dd>
            {rf.commitment !== undefined ? (
              <code>{rf.commitment}</code>
            ) : (
              `No commitment: ${NO_COMMITMENT[release] ?? "none is recorded in the release file."}`
            )}
          </dd>
          <dt>Errata</dt>
          <dd>
            <Link to="/errata" search={{ release }}>
              errata for this release
            </Link>
          </dd>
        </dl>

        <h3>
          {ds.challengeSet.length} challenges · {items} items
        </h3>
        <ul>
          {ds.challengeSet.map((c) => (
            <li key={c.id}>
              <code>{c.id}</code> v{c.version} · {c.items} items
            </li>
          ))}
        </ul>

        <h3>Snapshots to cite</h3>
        <ul>
          {entries.map((e) => (
            <li key={e.digest}>
              {e.title}
              {e.evalVersion !== null && (
                <>
                  {" "}
                  · eval <code>{e.evalVersion}</code>
                </>
              )}
              {e === entries.find((x) => x.dataset === e.dataset) ? " · current" : " · earlier"}
              <br />
              <code>{e.digest}</code>
            </li>
          ))}
        </ul>

        <h3>Verify</h3>
        <p>
          <code>./bench release verify {release}</code> re-derives every published prompt and scorer blob of the release and checks its
          challenge files against its release file{rf.commitment !== undefined ? ", then recomputes its commitment" : ""}.
        </p>
        <p>
          A snapshot digest above identifies exactly the rows this site shows; cite it. Rebuilding a snapshot to compare its digest also
          needs the execution bundles and archives it was built from, which are not yet published.
        </p>
      </article>
    </div>
  );
}
