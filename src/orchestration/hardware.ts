/**
 * Hardware profile stamped into every attempt header's `env.hardware`, and the
 * `hardwareId` derived from it. macOS reads `sysctl`, `system_profiler`, and
 * `sw_vers`; Linux reads `/etc/os-release` and `nvidia-smi` when present.
 * Every probe degrades to an absent field — a probe never fails a run. The
 * profile carries no hostname, serial number, or user name.
 */
import os from "node:os";
import { Command, type CommandExecutor } from "@effect/platform";
import { Effect } from "effect";
import { shortSha256, stableStringify } from "../config/hashing.js";
import type { HardwareProfile } from "../schema/run-manifest.js";

/** `hw.nperflevels`, then a name/count line pair per level → `{ name: cores }`. */
export const parseCoreTypes = (raw: string): Record<string, number> | undefined => {
  const [, ...rest] = raw.split("\n").map((l) => l.trim());
  const out: Record<string, number> = {};
  for (let i = 0; i + 1 < rest.length; i += 2) {
    const n = Number(rest[i + 1]);
    if (rest[i] && Number.isInteger(n)) out[rest[i] as string] = n;
  }
  return Object.keys(out).length === 0 ? undefined : out;
};

/** `system_profiler SPDisplaysDataType -json` → the first display GPU's model and core count. */
export const parseGpuCores = (raw: string): Pick<HardwareProfile, "gpu" | "gpuCores"> => {
  const parsed = Effect.runSync(
    Effect.try(() => JSON.parse(raw) as unknown).pipe(Effect.orElseSucceed(() => null)),
  );
  const gpu = (parsed as { SPDisplaysDataType?: Array<Record<string, unknown>> } | null)
    ?.SPDisplaysDataType?.[0];
  if (gpu === undefined) return {};
  const model = gpu["sppci_model"] ?? gpu["_name"];
  const cores = Number(gpu["sppci_cores"]);
  return {
    ...(typeof model === "string" ? { gpu: model } : {}),
    ...(Number.isInteger(cores) ? { gpuCores: cores } : {}),
  };
};

/** `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits` (MiB). */
export const parseNvidiaSmi = (raw: string): Pick<HardwareProfile, "gpu" | "gpuMemoryGb"> => {
  const rows = raw
    .split("\n")
    .map((l) => l.split(",").map((c) => c.trim()))
    .filter((r) => r.length === 2 && r[0] !== "");
  if (rows.length === 0) return {};
  const name = rows[0]?.[0] as string;
  const mib = rows.reduce((s, r) => s + Number(r[1]), 0);
  return {
    gpu: rows.length === 1 ? name : `${rows.length}× ${name}`,
    ...(Number.isFinite(mib) ? { gpuMemoryGb: Math.round(mib / 1024) } : {}),
  };
};

/** `/etc/os-release` → its `PRETTY_NAME`. */
export const parseOsRelease = (raw: string): string | undefined =>
  raw.match(/^PRETTY_NAME="?([^"\n]*)"?$/m)?.[1];

/** 12-hex identity of a machine: every profile field but `os`, so an OS update keeps it. */
export const hardwareId = (p: HardwareProfile): string => {
  const { os: _os, ...spec } = p;
  return shortSha256(stableStringify(spec));
};

/** Run a command for its stdout; any failure (missing binary, non-zero exit) → "". */
const sh = (script: string) =>
  Command.string(Command.make("sh", "-c", script)).pipe(Effect.orElseSucceed(() => ""));

const PERFLEVELS =
  'n=$(sysctl -n hw.nperflevels) && echo "$n" && i=0 && while [ "$i" -lt "$n" ]; do sysctl -n hw.perflevel$i.name hw.perflevel$i.physicalcpu; i=$((i+1)); done';

const probe: Effect.Effect<HardwareProfile, never, CommandExecutor.CommandExecutor> = Effect.gen(
  function* () {
    const cpus = os.cpus();
    const base = {
      cpu: cpus[0]?.model.trim() || "unknown",
      cpuCores: cpus.length,
      memoryGb: Math.round(os.totalmem() / 2 ** 30),
    };
    const fallbackOs = `${os.type()} ${os.release()}`;
    if (process.platform === "darwin") {
      const coreTypes = parseCoreTypes(yield* sh(PERFLEVELS));
      const gpu = parseGpuCores(yield* sh("system_profiler SPDisplaysDataType -json"));
      const version = (yield* sh("sw_vers -productVersion")).trim();
      return {
        ...base,
        ...(coreTypes === undefined ? {} : { coreTypes }),
        ...gpu,
        os: version === "" ? fallbackOs : `macOS ${version}`,
      };
    }
    const gpu = parseNvidiaSmi(
      yield* sh("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits"),
    );
    return { ...base, ...gpu, os: parseOsRelease(yield* sh("cat /etc/os-release")) ?? fallbackOs };
  },
);

let memo: HardwareProfile | undefined;

/** The machine's hardware profile, probed once per process. */
export const probeHardware: Effect.Effect<HardwareProfile, never, CommandExecutor.CommandExecutor> =
  Effect.suspend(() =>
    memo !== undefined
      ? Effect.succeed(memo)
      : Effect.tap(probe, (p) =>
          Effect.sync(() => {
            memo = p;
          }),
        ),
  );
