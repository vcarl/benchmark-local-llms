/**
 * Stub for the D2 report generator. At merge time this file goes away and
 * `report.ts` imports directly from `src/report/` — the sibling worktree's
 * output. Until then, this stub satisfies the compiler and prints a
 * placeholder message so `llm-bench report` is invokable and emits a clear
 * "not yet wired" message rather than failing at import time.
 *
 * Intentionally uses `console.log` — this file is under `src/cli/` which is
 * allowed by `scripts/lint-strict.sh`. When D2 is merged, delete this file
 * and swap the import in `commands/report.ts`.
 */
import { Effect } from "effect";

export interface GenerateReportArgs {
  readonly archiveGlob: string | undefined;
  readonly archiveDir: string;
  readonly scoring: "as-run" | "current";
  readonly output: string;
  readonly promptsDir: string;
}

export const generateReport = (args: GenerateReportArgs): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log("report: not yet wired (awaiting src/report/ merge)");
    console.log(
      JSON.stringify(
        {
          archiveGlob: args.archiveGlob ?? null,
          archiveDir: args.archiveDir,
          scoring: args.scoring,
          output: args.output,
          promptsDir: args.promptsDir,
        },
        null,
        2,
      ),
    );
  });
