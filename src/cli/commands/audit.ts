/**
 * `audit` subcommand — per-item quality statistics over completed attempt
 * archives (each config's latest result per challenge). Read-only; never
 * rewrites an archive. Stats live in `src/audit/stats.ts`.
 */
import { Command, Options } from "@effect/cli";
import { Effect, Option } from "effect";
import {
  type AuditOptions,
  auditItems,
  byDiscrimination,
  defaultAuditOptions,
  type ItemAudit,
  latestPerConfig,
  toObservations,
} from "../../audit/stats.js";
import { loadAttemptArchives } from "../../report/load-attempts.js";
import { makeLoggerLayer } from "../logger.js";

const archiveDir = Options.directory("archive-dir").pipe(
  Options.withDescription("Archive directory to scan"),
  Options.withDefault("./benchmark-archive"),
);
const challenge = Options.text("challenge").pipe(
  Options.optional,
  Options.withDescription("Only items of this challenge id"),
);
const flag = Options.text("flag").pipe(
  Options.optional,
  Options.withDescription(
    "Only items carrying this flag: suspect-key | saturated | edge | zero-failure",
  ),
);
const json = Options.boolean("json").pipe(
  Options.withDefault(false),
  Options.withDescription("Emit JSON instead of a table"),
);
const minN = Options.integer("min-n").pipe(
  Options.withDefault(defaultAuditOptions.minN),
  Options.withDescription("Minimum configs per item for suspect-key / edge flags"),
);
const edgeTop = Options.integer("edge-top").pipe(
  Options.withDefault(defaultAuditOptions.edgeTop),
  Options.withDescription("Number of highest-discrimination items flagged edge"),
);
const verbose = Options.boolean("verbose").pipe(Options.withAlias("v"), Options.withDefault(false));

const fmt = (x: number | null): string => (x === null ? "  -  " : x.toFixed(2).padStart(5));

/** Plain tab-free table: one line per item, sorted as given. */
export const formatTable = (rows: ReadonlyArray<ItemAudit>): string => {
  const head = "challenge/item\tn\tp\tspread\tdisc\tflags\ttop-wrong";
  const lines = rows.map((r) =>
    [
      `${r.challengeId}/${r.itemId}`,
      r.n,
      fmt(r.p),
      fmt(r.spread),
      fmt(r.discrimination),
      r.flags.join(",") || "-",
      r.modalWrong.map((w) => `${w.answer}x${w.count}`).join(" | ") || "-",
    ].join("\t"),
  );
  return [head, ...lines].join("\n");
};

export const selectRows = (
  rows: ReadonlyArray<ItemAudit>,
  filters: { challenge?: string | undefined; flag?: string | undefined },
): ItemAudit[] =>
  rows
    .filter((r) => filters.challenge === undefined || r.challengeId === filters.challenge)
    .filter((r) => filters.flag === undefined || r.flags.some((f) => f === filters.flag))
    .sort(byDiscrimination);

export const auditCommand = Command.make(
  "audit",
  { archiveDir, challenge, flag, json, minN, edgeTop, verbose },
  (args) =>
    Effect.gen(function* () {
      const { attempts } = yield* loadAttemptArchives(args.archiveDir);
      const opts: AuditOptions = { ...defaultAuditOptions, minN: args.minN, edgeTop: args.edgeTop };
      const rows = selectRows(auditItems(toObservations(latestPerConfig(attempts)), opts), {
        challenge: Option.getOrUndefined(args.challenge),
        flag: Option.getOrUndefined(args.flag),
      });
      yield* Effect.sync(() => {
        console.log(args.json ? JSON.stringify(rows, null, 2) : formatTable(rows));
      });
    }).pipe(Effect.provide(makeLoggerLayer(args.verbose))),
).pipe(
  Command.withDescription(
    "Per-item pass rate, discrimination, suspect-key / saturated / edge / zero-failure flags across configs",
  ),
);
