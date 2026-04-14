/**
 * Stub for the D3 migration tool. See `./report-stub.ts` for the rationale.
 */
import { Effect } from "effect";

export interface RunMigrationArgs {
  readonly inputDir: string;
  readonly outputDir: string;
  readonly promptsDir: string;
  readonly dryRun: boolean;
}

export const runMigration = (args: RunMigrationArgs): Effect.Effect<void> =>
  Effect.sync(() => {
    console.log("migrate: not yet wired (awaiting src/migrate/ merge)");
    console.log(
      JSON.stringify(
        {
          inputDir: args.inputDir,
          outputDir: args.outputDir,
          promptsDir: args.promptsDir,
          dryRun: args.dryRun,
        },
        null,
        2,
      ),
    );
  });
