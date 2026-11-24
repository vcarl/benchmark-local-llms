import { Effect, Either, LogLevel } from "effect";
import { describe, expect, it } from "vitest";
import { captureLogs } from "../../__tests__/log-capture.js";
import { harnessTree, logSummary } from "../report.js";

const entry = (dataset: string, evalVersion: string | null) => ({
  dataset,
  title: dataset,
  release: "0",
  evalVersion,
  ranked: false,
  legacy: true,
  digest: `${dataset}-digest`,
  rows: 3,
  challenges: 2,
  span: null,
});

describe("logSummary", () => {
  it("prints one line per snapshot, then details and kept entries", async () => {
    const sink: string[] = [];
    await Effect.runPromise(
      logSummary({
        snapshots: [
          { entry: entry("alpha", "0.7"), written: true },
          { entry: entry("draft", null), written: false },
        ],
        detailsWritten: 4,
        detailsPruned: 0,
        detailsSkipped: 1,
        kept: 2,
      }).pipe(Effect.provide(captureLogs(sink, LogLevel.Info))),
    );
    expect(
      sink.some((l) => l.includes("alpha @ 0.7: 3 rows over 2 challenges → alpha-digest.json")),
    ).toBe(true);
    expect(
      sink.some((l) =>
        l.includes("draft: 3 rows over 2 challenges → draft-digest.json (unchanged)"),
      ),
    ).toBe(true);
    expect(
      sink.some((l) => l.includes("details 4 written, 1 skipped") && l.includes("keeps 2")),
    ).toBe(true);
  });
});

describe("harnessTree", () => {
  it("refuses tracked changes the rows can depend on, naming them, unless --allow-dirty", () => {
    expect(harnessTree([], false)).toEqual(Either.right({ harnessDirty: false }));
    const refused = harnessTree([" M src/report/index.ts", " M configs.yaml"], false);
    expect(Either.isLeft(refused) && refused.left.message).toMatch(
      /src\/report\/index\.ts.*configs\.yaml.*--allow-dirty/s,
    );
    expect(harnessTree([" M src/report/index.ts"], true)).toEqual(
      Either.right({ harnessDirty: true }),
    );
  });
});
